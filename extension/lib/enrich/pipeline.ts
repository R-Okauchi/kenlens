/**
 * DOI エンリッチパイプライン (background SW)。
 * 経路: OpenAlex 単体 lookup (主) → 404 なら Crossref (+ OA は Unpaywall) → 両方 404 で found:false。
 * 結果は成功/ネガティブとも 7 日キャッシュ。トランスポートエラーはキャッシュせず throw する
 * (呼び出し側がその DOI を応答から省き、UI は error 状態 + 再試行になる)。
 */
import { TTL, cacheGet, cacheKey, cacheSet } from '../cache/store';
import type { EnrichmentRecord, TitleResolution } from '../researchmap/types';
import { getOpenAlexApiKey } from '../settings/settings';
import { fetchCrossrefByDoi, resolveTitleViaCrossref } from './crossref';
import { fetchOpenAlexBatch, fetchOpenAlexByDoi, type OpenAlexWork } from './openalex';
import { fetchUnpaywall } from './unpaywall';
import { normalizeTitle } from './match';

function recordFromOpenAlex(doi: string, work: OpenAlexWork): EnrichmentRecord {
  return {
    doi,
    fetchedAt: Date.now(),
    found: true,
    citationSource: 'openalex',
    citedByCount: work.citedByCount,
    isXpac: work.isXpac,
    isOa: work.isOa,
    oaStatus: work.oaStatus,
    oaUrl: work.oaUrl,
    openAlexUrl: work.id || null,
  };
}

function notFoundRecord(doi: string): EnrichmentRecord {
  return {
    doi,
    fetchedAt: Date.now(),
    found: false,
    citationSource: null,
    citedByCount: null,
    isXpac: false,
    isOa: null,
    oaStatus: null,
    oaUrl: null,
    openAlexUrl: null,
  };
}

async function enrichViaCrossref(doi: string): Promise<EnrichmentRecord> {
  const crossref = await fetchCrossrefByDoi(doi);
  if (!crossref) return notFoundRecord(doi);

  let oa: { isOa: boolean; oaStatus: string | null; oaUrl: string | null } | null = null;
  try {
    oa = await fetchUnpaywall(doi);
  } catch {
    // OA 情報の欠落は致命的ではない (被引用数は返せる)
  }
  return {
    doi,
    fetchedAt: Date.now(),
    found: true,
    citationSource: 'crossref',
    citedByCount: crossref.citedByCount,
    isXpac: false,
    isOa: oa?.isOa ?? null,
    oaStatus: oa?.oaStatus ?? null,
    oaUrl: oa?.oaUrl ?? null,
    openAlexUrl: null,
  };
}

/** 同一 DOI の同時要求 (複数タブ・カードとバッジの並走) を 1 fetch に束ねる */
const inflightDois = new Map<string, Promise<EnrichmentRecord>>();

async function enrichOne(doi: string, apiKey: string | null): Promise<EnrichmentRecord> {
  const key = cacheKey('enrich', doi);
  const cached = await cacheGet<EnrichmentRecord>(key, TTL.enrich);
  if (cached) return cached;

  const existing = inflightDois.get(doi);
  if (existing) return existing;

  const promise = (async () => {
    const work = await fetchOpenAlexByDoi(doi, apiKey);
    const record = work ? recordFromOpenAlex(doi, work) : await enrichViaCrossref(doi);
    await cacheSet(key, record);
    return record;
  })().finally(() => inflightDois.delete(doi));
  inflightDois.set(doi, promise);
  return promise;
}

/**
 * DOI 群のエンリッチ。失敗した DOI は結果マップから省かれる。
 * API キー設定時はバッチで先に温め、未ヒット分のみ単体経路に流す。
 */
export async function enrichDois(
  dois: readonly string[],
): Promise<Record<string, EnrichmentRecord>> {
  const result: Record<string, EnrichmentRecord> = {};
  const apiKey = await getOpenAlexApiKey();
  let pending = [...new Set(dois)];

  // キャッシュ命中分を先に返す
  const uncached: string[] = [];
  for (const doi of pending) {
    const cached = await cacheGet<EnrichmentRecord>(cacheKey('enrich', doi), TTL.enrich);
    if (cached) result[doi] = cached;
    else uncached.push(doi);
  }
  pending = uncached;

  if (apiKey && pending.length > 1) {
    try {
      const batch = await fetchOpenAlexBatch(pending, apiKey);
      for (const [doi, work] of batch) {
        const record = recordFromOpenAlex(doi, work);
        await cacheSet(cacheKey('enrich', doi), record);
        result[doi] = record;
      }
      pending = pending.filter((doi) => !batch.has(doi));
    } catch {
      // バッチ失敗は単体経路にフォールバック
    }
  }

  await Promise.all(
    pending.map(async (doi) => {
      try {
        result[doi] = await enrichOne(doi, apiKey);
      } catch {
        // トランスポート失敗 → 結果から省く (UI 側で error + 再試行)
      }
    }),
  );

  return result;
}

/** DOI なし欧文タイトルの照合。ネガティブ結果も 30 日キャッシュ */
export async function resolveTitleDoi(
  title: string,
  year: number | null,
  firstAuthorFamily: string | null,
): Promise<TitleResolution> {
  const norm = normalizeTitle(title);
  if (norm === '') return { doi: null, confidence: 0 };

  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${norm}|${year ?? ''}`),
  );
  const hash = [...new Uint8Array(digest)]
    .slice(0, 12)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const key = cacheKey('title', hash);

  const cached = await cacheGet<TitleResolution>(key, TTL.title);
  if (cached) return cached;

  let resolution: TitleResolution = { doi: null, confidence: 0 };
  const resolved = await resolveTitleViaCrossref(title, year, firstAuthorFamily);
  if (resolved) resolution = resolved;

  await cacheSet(key, resolution);
  return resolution;
}
