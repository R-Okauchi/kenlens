/**
 * 外部ソースの論文リストと researchmap の業績の突合 (純関数)。
 * 一致判定: DOI 完全一致 (主) → 正規化タイトル類似 (従)。
 * 「無い」と断定しない — UI では常に「未登録の可能性」として提示し、本人が確認する。
 */
import { RESOLVE_ACCEPT_THRESHOLD, normalizeTitle, titleSimilarity } from '../enrich/match';
import type { Publication } from '../researchmap/types';
import type { ReportCandidate } from './types';

export interface DiffResult {
  missing: ReportCandidate[];
  /** researchmap に既にあると判定して除外した件数 (カバレッジ開示用) */
  matchedCount: number;
}

export function diffAgainstResearchmap(
  candidates: readonly ReportCandidate[],
  rmPapers: readonly Publication[],
): DiffResult {
  const rmDois = new Set(rmPapers.flatMap((p) => p.dois));
  const rmTitles = rmPapers
    .flatMap((p) => [p.titleJa, p.titleEn])
    .filter((t): t is string => !!t)
    .map((t) => ({ raw: t, norm: normalizeTitle(t) }));
  const rmTitleSet = new Set(rmTitles.map((t) => t.norm));

  const missing: ReportCandidate[] = [];
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
    if (rmTitleSet.has(norm)) {
      matchedCount++;
      continue;
    }
    // 完全一致しないタイトルは類似度で検算 (表記揺れの取りこぼし防止)
    const similar = rmTitles.some(
      (t) => titleSimilarity(c.title, t.raw) >= RESOLVE_ACCEPT_THRESHOLD,
    );
    if (similar) {
      matchedCount++;
      continue;
    }
    missing.push(c);
  }

  // 新しい順 (年降順、不明は末尾)
  missing.sort((a, b) => (b.year ?? -1) - (a.year ?? -1));
  return { missing, matchedCount };
}
