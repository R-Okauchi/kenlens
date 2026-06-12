/**
 * researchmap API v2 (JSON-LD) の published_papers item → Publication 正規化。
 * フィールド形は tests/fixtures/api/rm-papers-stem.json で検証済み。
 */
import { dedupeDois } from '../enrich/doi';
import type { ExternalLink, Publication } from './types';

/** see_also の label → 表示名。doi と研究課題は外部リンクには含めない */
const LINK_LABELS: Record<string, string> = {
  cinii_research: 'CiNii Research',
  cinii_articles: 'CiNii',
  cinii_books: 'CiNii Books',
  scopus: 'Scopus',
  web_of_science: 'Web of Science',
  pubmed: 'PubMed',
  DBLP: 'DBLP',
  dblp_url: 'DBLP',
  j_global: 'J-GLOBAL',
  url: 'URL',
};

interface RmLocalized {
  ja?: string;
  en?: string;
}

interface RmAuthor {
  name?: string;
}

interface RmSeeAlso {
  '@id'?: string;
  label?: string;
}

export interface RmPaperRaw {
  'rm:id'?: number | string;
  paper_title?: RmLocalized;
  authors?: { ja?: RmAuthor[]; en?: RmAuthor[] };
  publication_date?: string;
  publication_name?: RmLocalized;
  referee?: boolean;
  invited?: boolean;
  'rm:is_open_access'?: boolean;
  identifiers?: { doi?: string[] };
  see_also?: RmSeeAlso[];
}

export interface RmListResponse {
  total_items?: number;
  items?: RmPaperRaw[];
}

function names(list: RmAuthor[] | undefined): string[] {
  return (list ?? [])
    .map((a) => a.name?.trim() ?? '')
    .filter((name) => name !== '');
}

export function normalizePaper(raw: RmPaperRaw): Publication | null {
  const rmId = raw['rm:id'];
  if (rmId === undefined || rmId === null) return null;

  // DOI は identifiers.doi と see_also[label=doi] の和集合 (片方にしか無いことがある)
  const doiCandidates: string[] = [...(raw.identifiers?.doi ?? [])];
  const externalLinks: ExternalLink[] = [];
  for (const link of raw.see_also ?? []) {
    const url = link['@id'];
    if (!url) continue;
    if (link.label === 'doi') {
      doiCandidates.push(url);
      continue;
    }
    const label = LINK_LABELS[link.label ?? ''];
    if (label && !externalLinks.some((l) => l.url === url)) {
      externalLinks.push({ label, url });
    }
  }

  return {
    rmId: String(rmId),
    titleJa: raw.paper_title?.ja?.trim() || null,
    titleEn: raw.paper_title?.en?.trim() || null,
    authorsJa: names(raw.authors?.ja),
    authorsEn: names(raw.authors?.en),
    publicationDate: raw.publication_date ?? null,
    publicationName: raw.publication_name?.ja ?? raw.publication_name?.en ?? null,
    referee: raw.referee === true,
    invited: raw.invited === true,
    isOaClaimed: raw['rm:is_open_access'] === true,
    dois: dedupeDois(doiCandidates),
    externalLinks,
  };
}

/** カテゴリごとのタイトルフィールド名 (API 実応答で確認済み) */
export const RM_TITLE_KEYS = {
  misc: 'paper_title',
  books_etc: 'book_title',
  presentations: 'presentation_title',
} as const;

export type RmOtherCategory = keyof typeof RM_TITLE_KEYS;

interface RmGenericItemRaw {
  paper_title?: RmLocalized;
  book_title?: RmLocalized;
  presentation_title?: RmLocalized;
  identifiers?: { doi?: string[] };
  see_also?: RmSeeAlso[];
}

/**
 * misc / books_etc / presentations の item → タイトル + DOI の軽量索引。
 * 整備レポートの突合にしか使わないため Publication への正規化はしない。
 */
export function normalizeTitleDoiList(
  json: { items?: RmGenericItemRaw[] },
  category: RmOtherCategory,
): { titles: string[]; dois: string[]; rawCount: number } {
  const titleKey = RM_TITLE_KEYS[category];
  const titles: string[] = [];
  const doiCandidates: string[] = [];
  for (const item of json.items ?? []) {
    const title = item[titleKey];
    for (const t of [title?.ja, title?.en]) {
      const trimmed = t?.trim();
      if (trimmed) titles.push(trimmed);
    }
    doiCandidates.push(...(item.identifiers?.doi ?? []));
    for (const link of item.see_also ?? []) {
      if (link.label === 'doi' && link['@id']) doiCandidates.push(link['@id']);
    }
  }
  return { titles, dois: dedupeDois(doiCandidates), rawCount: json.items?.length ?? 0 };
}

export function normalizeListResponse(json: RmListResponse): {
  totalItems: number;
  papers: Publication[];
  /** 正規化で落ちた item を含む生の件数 (ページングの打ち切り判定はこちらを使う) */
  rawCount: number;
} {
  const rawCount = json.items?.length ?? 0;
  const papers = (json.items ?? [])
    .map(normalizePaper)
    .filter((p): p is Publication => p !== null);
  return { totalItems: json.total_items ?? papers.length, papers, rawCount };
}
