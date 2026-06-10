/**
 * 設定ストア。
 * - 表示系設定は storage.sync (端末間同期)。
 * - OpenAlex API キーは storage.local (意図的に同期しない — 漏洩面の最小化)。
 */
import { browser } from 'wxt/browser';

export interface Settings {
  /** 'auto' = ページ言語追従 (?lang=en / html[lang]) */
  language: 'auto' | 'ja' | 'en';
  /** 'auto' = API デフォルト + ブレーカ/リモート設定で自動縮退 */
  dataMode: 'auto' | 'api' | 'dom-only';
  badges: {
    citations: boolean;
    oa: boolean;
    /** クローズドも 🔒 チップで表示する (既定 OFF — no-data は沈黙が原則) */
    oaShowClosed: boolean;
    doi: boolean;
    /** ✎ DOI候補 (整備ヒント) */
    doiHint: boolean;
  };
  summaryCard: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'auto',
  dataMode: 'auto',
  badges: {
    citations: true,
    oa: true,
    oaShowClosed: false,
    doi: true,
    doiHint: true,
  },
  summaryCard: true,
};

const SYNC_KEY = 'kl:settings';
const LOCAL_KEY = 'kl:openalex-key';

export async function getSettings(): Promise<Settings> {
  const raw = (await browser.storage.sync.get(SYNC_KEY))[SYNC_KEY] as
    | Partial<Settings>
    | undefined;
  if (!raw) return DEFAULT_SETTINGS;
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    badges: { ...DEFAULT_SETTINGS.badges, ...(raw.badges ?? {}) },
  };
}

export async function setSettings(patch: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  const next: Settings = {
    ...current,
    ...patch,
    badges: { ...current.badges, ...(patch.badges ?? {}) },
  };
  await browser.storage.sync.set({ [SYNC_KEY]: next });
}

export function watchSettings(callback: (s: Settings) => void): () => void {
  const listener = (
    changes: Record<string, { newValue?: unknown }>,
    area: string,
  ) => {
    if (area === 'sync' && changes[SYNC_KEY]) void getSettings().then(callback);
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}

export async function getOpenAlexApiKey(): Promise<string | null> {
  const raw = (await browser.storage.local.get(LOCAL_KEY))[LOCAL_KEY];
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
}

export async function setOpenAlexApiKey(key: string): Promise<void> {
  if (key.trim() === '') await browser.storage.local.remove(LOCAL_KEY);
  else await browser.storage.local.set({ [LOCAL_KEY]: key.trim() });
}
