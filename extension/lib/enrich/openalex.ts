/**
 * OpenAlex クライアント。
 * - DOI 単体 lookup は無料・無制限 (2026-06 実測) → 既定経路。匿名 $1/日枠を消費しない
 * - API キー設定時のみバッチ (filter=doi: ≤100件) を使う
 * - 404 は HTML を返す (実測) — politeFetch が HttpError を投げるので JSON パースには到達しない
 */
import { HttpError, politeFetch } from '../net/queue';
import { normalizeDoi } from './doi';

const BASE = 'https://api.openalex.org';
export const OPENALEX_BATCH_LIMIT = 100;

export interface OpenAlexWork {
  id: string;
  doi: string | null;
  citedByCount: number;
  isXpac: boolean;
  isOa: boolean | null;
  oaStatus: string | null;
  oaUrl: string | null;
}

interface RawWork {
  id?: string;
  doi?: string;
  cited_by_count?: number;
  is_xpac?: boolean;
  open_access?: { is_oa?: boolean; oa_status?: string; oa_url?: string | null };
  best_oa_location?: { pdf_url?: string | null; landing_page_url?: string | null };
}

function toWork(raw: RawWork): OpenAlexWork {
  return {
    id: raw.id ?? '',
    doi: raw.doi ? normalizeDoi(raw.doi) : null,
    citedByCount: raw.cited_by_count ?? 0,
    isXpac: raw.is_xpac === true,
    isOa: raw.open_access?.is_oa ?? null,
    oaStatus: raw.open_access?.oa_status ?? null,
    oaUrl:
      raw.open_access?.oa_url ??
      raw.best_oa_location?.pdf_url ??
      raw.best_oa_location?.landing_page_url ??
      null,
  };
}

function withKey(url: string, apiKey: string | null): string {
  return apiKey ? `${url}${url.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(apiKey)}` : url;
}

/** 単体 lookup。未収録 (404) は null */
export async function fetchOpenAlexByDoi(
  doi: string,
  apiKey: string | null = null,
): Promise<OpenAlexWork | null> {
  const url = withKey(`${BASE}/works/doi:${encodeURIComponent(doi)}`, apiKey);
  try {
    const res = await politeFetch(url, { headers: { Accept: 'application/json' } });
    return toWork((await res.json()) as RawWork);
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return null;
    throw err;
  }
}

/**
 * バッチ lookup (API キー設定時のみ呼ぶ)。
 * 返り値は DOI → work。未収録 DOI はマップに現れない (= 呼び出し側で 404 相当として扱う)。
 * パイプ文字を含む DOI は filter 構文を壊すため除外する (呼び出し側で単体 lookup に回す)。
 */
export async function fetchOpenAlexBatch(
  dois: readonly string[],
  apiKey: string,
): Promise<Map<string, OpenAlexWork>> {
  const result = new Map<string, OpenAlexWork>();
  const batchable = dois.filter((d) => !d.includes('|') && !d.includes(','));

  for (let i = 0; i < batchable.length; i += OPENALEX_BATCH_LIMIT) {
    const chunk = batchable.slice(i, i + OPENALEX_BATCH_LIMIT);
    const filter = `doi:${chunk.join('|')}`;
    const url = withKey(
      `${BASE}/works?filter=${encodeURIComponent(filter)}&per-page=${OPENALEX_BATCH_LIMIT}`,
      apiKey,
    );
    const res = await politeFetch(url, { headers: { Accept: 'application/json' } });
    const json = (await res.json()) as { results?: RawWork[] };
    for (const raw of json.results ?? []) {
      const work = toWork(raw);
      if (work.doi) result.set(work.doi, work);
    }
  }
  return result;
}
