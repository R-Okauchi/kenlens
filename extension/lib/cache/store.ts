/**
 * storage.local キャッシュ (TTL + 退避)。
 * SW はアイドル 30 秒で死ぬためメモリキャッシュは持たず、常にここを通す。
 * ネガティブ結果 (404) もキャッシュする — JaLC DOI などは毎回 404 になるため。
 */
import { browser } from 'wxt/browser';

export const TTL = {
  /** researchmap 業績一覧 */
  rm: 24 * 60 * 60 * 1000,
  /** DOI ごとの外部 DB 照合結果 (404 含む) */
  enrich: 7 * 24 * 60 * 60 * 1000,
  /** タイトル→DOI 照合 (ネガティブ含む) */
  title: 30 * 24 * 60 * 60 * 1000,
  /** 整備レポート (著者推定 + 著者の全論文) */
  report: 24 * 60 * 60 * 1000,
  /** 整備レポートの突合用: MISC・書籍・講演のタイトル/DOI 索引 */
  rmOther: 24 * 60 * 60 * 1000,
} as const;

const PREFIX = 'kl:cache:';
const MAX_ENTRIES = 20_000;
const KEEP_ENTRIES = 15_000;
/**
 * aggressive 退避時のバイト予算 (storage.local quota 10MB の 60%)。
 * rm エントリは 1000 論文プロフィールで ~0.5MB あるため、件数上限だけでは
 * quota 超過時に何も削れず「キャッシュが静かに死ぬ」— バイトでも必ず削る。
 */
const AGGRESSIVE_BYTE_BUDGET = 6 * 1024 * 1024;

interface CacheEntry<T> {
  fetchedAt: number;
  value: T;
}

export function cacheKey(kind: keyof typeof TTL, id: string): string {
  return `${PREFIX}${kind}:${id}`;
}

export async function cacheGet<T>(key: string, ttlMs: number): Promise<T | null> {
  const raw = (await browser.storage.local.get(key))[key] as
    | CacheEntry<T>
    | undefined;
  if (!raw || typeof raw.fetchedAt !== 'number') return null;
  if (Date.now() - raw.fetchedAt > ttlMs) return null;
  return raw.value;
}

export async function cacheGetWithAge<T>(
  key: string,
  ttlMs: number,
): Promise<{ value: T; fetchedAt: number } | null> {
  const raw = (await browser.storage.local.get(key))[key] as
    | CacheEntry<T>
    | undefined;
  if (!raw || typeof raw.fetchedAt !== 'number') return null;
  if (Date.now() - raw.fetchedAt > ttlMs) return null;
  return { value: raw.value, fetchedAt: raw.fetchedAt };
}

export async function cacheSet<T>(key: string, value: T): Promise<void> {
  const entry: CacheEntry<T> = { fetchedAt: Date.now(), value };
  try {
    await browser.storage.local.set({ [key]: entry });
  } catch {
    // QUOTA_BYTES 超過時は退避してリトライ (それでも失敗したら諦める — キャッシュは任意)
    await evict(true);
    try {
      await browser.storage.local.set({ [key]: entry });
    } catch {
      /* noop */
    }
  }
}

/**
 * 期限切れエントリの削除。
 * aggressive 時 (quota 超過からの回復) は件数上限に加えてバイト予算でも
 * 古い順に削る — 生きたエントリだけで quota が埋まるケースを必ず解消するため。
 */
export async function evict(aggressive = false): Promise<void> {
  const all = await browser.storage.local.get(null);
  const entries: {
    key: string;
    fetchedAt: number;
    expired: boolean;
    bytes: number;
  }[] = [];
  const now = Date.now();

  for (const [key, raw] of Object.entries(all)) {
    if (!key.startsWith(PREFIX)) continue;
    const entry = raw as CacheEntry<unknown>;
    const kind = key.slice(PREFIX.length).split(':')[0] as keyof typeof TTL;
    const ttl = TTL[kind] ?? TTL.enrich;
    entries.push({
      key,
      fetchedAt: entry.fetchedAt ?? 0,
      expired: now - (entry.fetchedAt ?? 0) > ttl,
      bytes: key.length + JSON.stringify(raw).length,
    });
  }

  const toRemove = entries.filter((e) => e.expired).map((e) => e.key);
  const live = entries
    .filter((e) => !e.expired)
    .sort((a, b) => a.fetchedAt - b.fetchedAt);

  const limit = aggressive ? KEEP_ENTRIES : MAX_ENTRIES;
  let dropCount = live.length > limit ? live.length - KEEP_ENTRIES : 0;

  if (aggressive) {
    let liveBytes = live.reduce((sum, e) => sum + e.bytes, 0);
    let i = dropCount;
    while (liveBytes > AGGRESSIVE_BYTE_BUDGET && i < live.length) {
      liveBytes -= live[i]!.bytes;
      i++;
    }
    dropCount = Math.max(dropCount, i);
  }

  toRemove.push(...live.slice(0, dropCount).map((e) => e.key));
  if (toRemove.length > 0) await browser.storage.local.remove(toRemove);
}

export async function clearAll(): Promise<number> {
  const all = await browser.storage.local.get(null);
  const keys = Object.keys(all).filter((k) => k.startsWith(PREFIX));
  await browser.storage.local.remove(keys);
  return keys.length;
}

export async function stats(): Promise<{ entries: number; approxBytes: number }> {
  const all = await browser.storage.local.get(null);
  let entries = 0;
  let approxBytes = 0;
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith(PREFIX)) continue;
    entries++;
    approxBytes += key.length + JSON.stringify(value).length;
  }
  return { entries, approxBytes };
}
