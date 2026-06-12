/**
 * 動作モード解決 + リモート設定 (キルスイッチ)。
 *
 * 優先順位: 設定の dom-only > リモート killApiMode > researchmap ブレーカ > 既定 'api'。
 * 設定で API モードを「強制」する経路は置かない — キルスイッチを迂回できる
 * 抜け道になるため (JSON 1 個で全インストールが 24h 以内に DOM-only へ縮退する、
 * という保証が成り立たなくなる)。
 * リモート設定は静的 JSON (コードではない — CWS のリモートコード禁止に適合)。
 */
import { browser } from 'wxt/browser';
import { REMOTE_CONFIG_URL } from '../constants';
import type { DataMode, ModeReason } from '../researchmap/types';
import type { Settings } from '../settings/settings';

const FLAGS_KEY = 'kl:flags';

/** researchmap API 異常時の自動縮退期間 (6h 後に自動再試行) */
const RM_BREAKER_MS = 6 * 60 * 60 * 1000;

export interface RemoteConfig {
  killApiMode: boolean;
  notice?: { ja?: string; en?: string };
}

interface FlagsState {
  rmBreakerUntil?: number;
  remote?: { fetchedAt: number; config: RemoteConfig };
}

async function getFlags(): Promise<FlagsState> {
  return ((await browser.storage.local.get(FLAGS_KEY))[FLAGS_KEY] ?? {}) as FlagsState;
}

/**
 * read-modify-write を直列化する。ブレーカ書き込み (getPublications 失敗時) と
 * リモート設定更新 (alarm) は独立イベントから同時に走り得るため、
 * 素朴な実装では片方の書き込みが消える。
 */
let writeChain: Promise<void> = Promise.resolve();

function setFlags(patch: Partial<FlagsState>): Promise<void> {
  writeChain = writeChain.then(async () => {
    const current = await getFlags();
    await browser.storage.local.set({ [FLAGS_KEY]: { ...current, ...patch } });
  });
  return writeChain;
}

export async function resolveMode(
  settings: Settings,
): Promise<{ mode: DataMode; reason: ModeReason }> {
  // 'api' の明示値はここでは特別扱いしない (キルスイッチ迂回の防止)。
  // UI からは 'auto' / 'dom-only' しか設定できず、'api' は遺物値として
  // 'auto' と同じ経路 (リモート設定・ブレーカに従う) に落とす
  if (settings.dataMode === 'dom-only') return { mode: 'dom-only', reason: 'settings' };

  const flags = await getFlags();
  if (flags.remote?.config.killApiMode) {
    return { mode: 'dom-only', reason: 'remote-config' };
  }
  if ((flags.rmBreakerUntil ?? 0) > Date.now()) {
    return { mode: 'dom-only', reason: 'breaker' };
  }
  return { mode: 'api', reason: 'default' };
}

/** researchmap API の広域異常 (429/5xx 連続・非 JSON 応答) を検知したら呼ぶ */
export async function tripResearchmapBreaker(): Promise<void> {
  await setFlags({ rmBreakerUntil: Date.now() + RM_BREAKER_MS });
}

/**
 * 古ければリモート設定を更新する。alarm の取りこぼし対策として
 * 通常リクエスト経路からも opportunistic に呼ぶ (キルスイッチの到達性保証)。
 */
export async function refreshRemoteConfigIfStale(
  maxAgeMs = 24 * 60 * 60 * 1000,
): Promise<void> {
  const flags = await getFlags();
  if (Date.now() - (flags.remote?.fetchedAt ?? 0) >= maxAgeMs) {
    await refreshRemoteConfig();
  }
}

/** 日次 alarm から呼ぶ。失敗しても既存設定を保持する */
export async function refreshRemoteConfig(): Promise<void> {
  try {
    const res = await fetch(REMOTE_CONFIG_URL, { cache: 'no-cache' });
    if (!res.ok) return;
    const json = (await res.json()) as Partial<RemoteConfig>;
    const config: RemoteConfig = {
      killApiMode: json.killApiMode === true,
      notice: json.notice,
    };
    await setFlags({ remote: { fetchedAt: Date.now(), config } });
  } catch {
    // ネットワーク失敗は無視 (次回 alarm で再試行)
  }
}
