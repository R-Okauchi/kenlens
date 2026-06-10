/**
 * Crossref クライアント。
 * - 被引用数フォールバック (is-referenced-by-count は OpenAlex 比 ~65% と系統的に少ない
 *   — 必ず出典ラベルを付け、OpenAlex の数値と混合加算しない)
 * - DOI なし欧文タイトルの照合 (受け入れは 類似度 ≥0.9 + 年±1 + 筆頭姓一致 の三重ゲート。
 *   query.bibliographic はピアレビューレコード等のノイズを返す — fixtures で実測)
 */
import { CONTACT_EMAIL } from '../constants';
import { HttpError, politeFetch } from '../net/queue';
import {
  RESOLVE_ACCEPT_THRESHOLD,
  titleSimilarity,
} from './match';
import { normalizeDoi } from './doi';

const BASE = 'https://api.crossref.org';

interface CrossrefItem {
  DOI?: string;
  title?: string[];
  'is-referenced-by-count'?: number;
  issued?: { 'date-parts'?: number[][] };
  author?: { family?: string }[];
}

export async function fetchCrossrefByDoi(
  doi: string,
): Promise<{ citedByCount: number } | null> {
  const url = `${BASE}/works/${encodeURIComponent(doi)}?mailto=${encodeURIComponent(CONTACT_EMAIL)}`;
  try {
    const res = await politeFetch(url, { headers: { Accept: 'application/json' } });
    const json = (await res.json()) as { message?: CrossrefItem };
    return { citedByCount: json.message?.['is-referenced-by-count'] ?? 0 };
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return null;
    throw err;
  }
}

function itemYear(item: CrossrefItem): number | null {
  const y = item.issued?.['date-parts']?.[0]?.[0];
  return typeof y === 'number' ? y : null;
}

export async function resolveTitleViaCrossref(
  title: string,
  year: number | null,
  firstAuthorFamily: string | null,
): Promise<{ doi: string; confidence: number } | null> {
  const params = new URLSearchParams({
    'query.bibliographic': title,
    rows: '3',
    select: 'DOI,title,issued,author',
    mailto: CONTACT_EMAIL,
  });
  const res = await politeFetch(`${BASE}/works?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  const json = (await res.json()) as { message?: { items?: CrossrefItem[] } };

  for (const item of json.message?.items ?? []) {
    const doi = item.DOI ? normalizeDoi(item.DOI) : null;
    const itemTitle = item.title?.[0];
    if (!doi || !itemTitle) continue;

    const similarity = titleSimilarity(title, itemTitle);
    if (similarity < RESOLVE_ACCEPT_THRESHOLD) continue;

    const y = itemYear(item);
    if (year !== null && y !== null && Math.abs(year - y) > 1) continue;

    if (firstAuthorFamily) {
      const families = (item.author ?? [])
        .map((a) => a.family?.normalize('NFKC').toLowerCase())
        .filter((f): f is string => !!f);
      if (families.length > 0 && !families.includes(firstAuthorFamily)) continue;
    }

    return { doi, confidence: similarity };
  }
  return null;
}
