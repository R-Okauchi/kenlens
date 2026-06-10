/**
 * ホスト別レート制限 + リトライ + サーキットブレーカ。
 * 全 fetch は background SW のこの単一窓口を通す。
 *
 * レート設計 (実測値と規約配慮に基づく):
 * - api.researchmap.jp: 1 req/s・並列1 (最も厳しく — ToS グレーゾーンへの自衛)
 * - api.openalex.org:   4 req/s・並列4 (singleton は無料・無制限だが polite に)
 * - api.crossref.org:   5 req/s・並列3 (polite pool 実測 10 req/s の半分)
 * - api.unpaywall.org:  5 req/s・並列3
 */

import { browser } from 'wxt/browser';

interface HostPolicy {
  minIntervalMs: number;
  concurrency: number;
}

const POLICIES: Record<string, HostPolicy> = {
  'api.researchmap.jp': { minIntervalMs: 1000, concurrency: 1 },
  'api.openalex.org': { minIntervalMs: 250, concurrency: 4 },
  'api.crossref.org': { minIntervalMs: 200, concurrency: 3 },
  'api.unpaywall.org': { minIntervalMs: 200, concurrency: 3 },
};

const DEFAULT_POLICY: HostPolicy = { minIntervalMs: 500, concurrency: 2 };

/** ブレーカ: 連続失敗でホストを一時停止 */
const BREAK_AFTER_FAILURES = 3;
const BREAK_DURATION_MS = 10 * 60 * 1000;

const RETRY_DELAYS_MS = [1000, 2000, 4000];

export class BreakerOpenError extends Error {
  constructor(public host: string) {
    super(`circuit breaker open for ${host}`);
    this.name = 'BreakerOpenError';
  }
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public url: string,
  ) {
    super(`HTTP ${status} for ${url}`);
    this.name = 'HttpError';
  }
}

class HostState {
  nextSlotAt = 0;
  running = 0;
  waiters: (() => void)[] = [];
  consecutiveFailures = 0;
  breakerUntil = 0;
}

const hostStates = new Map<string, HostState>();

/**
 * ブレーカの開放時刻は storage.local に永続化する。
 * MV3 SW はアイドル 30 秒で死ぬため、メモリだけでは「10 分停止」が
 * SW の寿命 (≒30秒) に縮んでしまい、障害中の外部 API を叩き続けることになる。
 */
const BREAKER_PERSIST_KEY = 'kl:net-breakers';
let hydratePromise: Promise<void> | null = null;

function hydrateBreakers(): Promise<void> {
  hydratePromise ??= (async () => {
    try {
      const raw = (await browser.storage.local.get(BREAKER_PERSIST_KEY))[
        BREAKER_PERSIST_KEY
      ] as Record<string, number> | undefined;
      if (!raw) return;
      const now = Date.now();
      for (const [host, until] of Object.entries(raw)) {
        if (typeof until === 'number' && until > now) {
          stateFor(host).breakerUntil = until;
        }
      }
    } catch {
      // 永続化は best-effort (読めなくても動作は続ける)
    }
  })();
  return hydratePromise;
}

function persistBreakers(): void {
  const out: Record<string, number> = {};
  const now = Date.now();
  for (const [host, s] of hostStates) {
    if (s.breakerUntil > now) out[host] = s.breakerUntil;
  }
  void browser.storage.local.set({ [BREAKER_PERSIST_KEY]: out }).catch(() => {});
}

function stateFor(host: string): HostState {
  let s = hostStates.get(host);
  if (!s) {
    s = new HostState();
    hostStates.set(host, s);
  }
  return s;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function acquire(host: string): Promise<void> {
  const policy = POLICIES[host] ?? DEFAULT_POLICY;
  const s = stateFor(host);

  while (s.running >= policy.concurrency) {
    await new Promise<void>((resolve) => s.waiters.push(resolve));
  }
  s.running++;

  const now = Date.now();
  const wait = Math.max(0, s.nextSlotAt - now);
  s.nextSlotAt = Math.max(now, s.nextSlotAt) + policy.minIntervalMs;
  if (wait > 0) await sleep(wait);
}

function release(host: string): void {
  const s = stateFor(host);
  s.running--;
  s.waiters.shift()?.();
}

function recordResult(host: string, ok: boolean): void {
  const s = stateFor(host);
  if (ok) {
    s.consecutiveFailures = 0;
    return;
  }
  s.consecutiveFailures++;
  if (s.consecutiveFailures >= BREAK_AFTER_FAILURES) {
    s.breakerUntil = Date.now() + BREAK_DURATION_MS;
    persistBreakers();
  }
}

export function isBreakerOpen(host: string): boolean {
  return stateFor(host).breakerUntil > Date.now();
}

/** テスト用 */
export function resetQueues(): void {
  hostStates.clear();
  hydratePromise = null;
}

/**
 * レート制限 + リトライ付き fetch。
 * - 429/5xx: Retry-After を尊重しつつ 1s/2s/4s で再試行、使い切ったらブレーカに記録して throw
 * - 4xx (429 以外): リトライせず HttpError を throw (404 は呼び出し側がネガティブ結果として扱う)
 */
export async function politeFetch(url: string, init?: RequestInit): Promise<Response> {
  const host = new URL(url).hostname;
  await hydrateBreakers();

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    // 入口だけでなく試行ごとに再チェックする — 同時並行のリクエスト群が
    // 全て入口を通過した後にブレーカが開いた場合、残りの試行を即座に止めるため
    if (isBreakerOpen(host)) throw new BreakerOpenError(host);
    await acquire(host);
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      release(host);
      lastError = err;
      recordResult(host, false);
      if (attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]!);
        continue;
      }
      throw err;
    }
    release(host);

    if (res.ok) {
      recordResult(host, true);
      return res;
    }

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable) {
      // 404 等のデータ起因エラーはブレーカに数えない
      recordResult(host, true);
      throw new HttpError(res.status, url);
    }

    recordResult(host, false);
    lastError = new HttpError(res.status, url);
    if (attempt < RETRY_DELAYS_MS.length) {
      const retryAfter = Number(res.headers.get('Retry-After'));
      const delay =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 30_000)
          : RETRY_DELAYS_MS[attempt]!;
      await sleep(delay);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
