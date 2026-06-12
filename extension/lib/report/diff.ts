/**
 * 外部ソースの論文リストと researchmap の業績の突合 (純関数)。
 * 一致判定: DOI 完全一致 (主) → 正規化タイトル類似 (従)。
 * 突合対象は論文 + MISC + 書籍 (どれかに一致 = 登録済みとして除外)。
 * 講演・口頭発表との一致は除外せず注記に留める — 講演登録と論文登録は
 * researchmap 上で別の業績であり、論文として未登録の可能性が残るため。
 * 「無い」と断定しない — UI では常に「未登録の可能性」として提示し、本人が確認する。
 */
import { RESOLVE_ACCEPT_THRESHOLD, normalizeTitle, titleSimilarity } from '../enrich/match';
import type { Publication, RmOtherWorks } from '../researchmap/types';
import type { ReportCandidate } from './types';

/** 未登録候補 + 講演一致の注記フラグ */
export interface MissingCandidate extends ReportCandidate {
  /** 同タイトル/同 DOI の講演・口頭発表が登録済み */
  presentationMatch: boolean;
}

export interface DiffResult {
  missing: MissingCandidate[];
  /** researchmap に既にあると判定して除外した件数 (カバレッジ開示用) */
  matchedCount: number;
  /** MISC・書籍・講演まで突合できたか (false = 論文のみ。UI で開示する) */
  comparedOtherWorks: boolean;
}

/** タイトル集合との一致判定 (正規化完全一致 → 類似度の二段) */
interface TitleIndex {
  set: Set<string>;
  entries: { raw: string; norm: string }[];
}

function buildTitleIndex(titles: readonly string[]): TitleIndex {
  const entries = titles
    .filter((t) => !!t)
    .map((t) => ({ raw: t, norm: normalizeTitle(t) }));
  return { set: new Set(entries.map((e) => e.norm)), entries };
}

function titleMatches(index: TitleIndex, title: string, norm: string): boolean {
  if (norm !== '' && index.set.has(norm)) return true;
  // 完全一致しないタイトルは類似度で検算 (表記揺れの取りこぼし防止)
  return index.entries.some(
    (t) => titleSimilarity(title, t.raw) >= RESOLVE_ACCEPT_THRESHOLD,
  );
}

export function diffAgainstResearchmap(
  candidates: readonly ReportCandidate[],
  rmPapers: readonly Publication[],
  otherWorks: RmOtherWorks | null = null,
): DiffResult {
  // 「登録済み」母集団 = 論文 + MISC + 書籍
  const rmDois = new Set([
    ...rmPapers.flatMap((p) => p.dois),
    ...(otherWorks?.registered.dois ?? []),
  ]);
  const registeredTitles = buildTitleIndex([
    ...rmPapers
      .flatMap((p) => [p.titleJa, p.titleEn])
      .filter((t): t is string => !!t),
    ...(otherWorks?.registered.titles ?? []),
  ]);

  const presDois = new Set(otherWorks?.presentations.dois ?? []);
  const presTitles = buildTitleIndex(otherWorks?.presentations.titles ?? []);

  const missing: MissingCandidate[] = [];
  let matchedCount = 0;
  const seen = new Set<string>();

  for (const c of candidates) {
    // 候補同士の重複も除く (DOI 優先、無ければ正規化タイトル)
    const dedupeKey = c.doi ?? `t:${normalizeTitle(c.title)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    if (c.doi && rmDois.has(c.doi)) {
      matchedCount++;
      continue;
    }
    const norm = normalizeTitle(c.title);
    if (norm === '') continue;
    if (titleMatches(registeredTitles, c.title, norm)) {
      matchedCount++;
      continue;
    }

    const presentationMatch =
      (c.doi !== null && presDois.has(c.doi)) ||
      titleMatches(presTitles, c.title, norm);
    missing.push({ ...c, presentationMatch });
  }

  // 新しい順 (年降順、不明は末尾)
  missing.sort((a, b) => (b.year ?? -1) - (a.year ?? -1));
  return { missing, matchedCount, comparedOtherWorks: otherWorks !== null };
}
