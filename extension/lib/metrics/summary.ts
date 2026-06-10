/**
 * サマリーカードのメトリクス計算 (純関数)。
 *
 * 分母の規約 (アンチ誤解の核心 — 必ず UI で分母を明示する):
 * - 被引用合計: OpenAlex 照合済み論文のみの合計。Crossref 由来は混合しない
 * - OA率: 分母 = OA 判定可能な論文 (DOI なしをクローズド扱いしない)
 * - DOI登録: 分母 = 全論文 (整備指標なので全件が正しい)
 * - 直近5年: 日付未登録は除外し、件数を脚注で開示する (整備ヒント)
 */
import type { EnrichmentRecord, Publication } from '../researchmap/types';

export interface CoauthorEntry {
  name: string;
  count: number;
}

export interface SummaryMetrics {
  totalPapers: number;
  /** [from, to] 年 (表示用に明示する) */
  range: { from: number; to: number };
  papers5y: number;
  undatedCount: number;
  citations: {
    /** OpenAlex 照合済み論文の被引用合計 */
    total: number;
    /** 合計に算入した論文数 (分子側の件数) */
    matched: number;
  };
  oa: {
    count: number;
    /** OA 判定可能だった論文数 (分母) */
    resolvable: number;
  };
  doi: {
    count: number;
    total: number;
    /** DOI 未登録論文の rmId (CTA のスクロール先) */
    missingRmIds: string[];
  };
  coauthors: CoauthorEntry[];
}

export function paperYear(p: Publication): number | null {
  const y = Number(p.publicationDate?.slice(0, 4));
  return Number.isFinite(y) && y >= 1900 && y <= 2100 ? y : null;
}

/** 「実質的な被引用データを持つか」— xpac の 0 はデータなし扱い (JaLC 系の見かけゼロ) */
export function hasCitationData(rec: EnrichmentRecord | undefined): rec is EnrichmentRecord {
  return (
    rec !== undefined &&
    rec.found &&
    rec.citationSource === 'openalex' &&
    rec.citedByCount !== null &&
    !(rec.isXpac && rec.citedByCount === 0)
  );
}

function normalizeName(name: string): string {
  return name.normalize('NFKC').replace(/[\s　]+/g, '').toLowerCase();
}

/**
 * 自己除外用の照合キー。空白除去形に加えて語順ソート形も返す
 * ("Taro Yamada" と "Yamada Taro" を同一視する)。
 */
function nameKeys(name: string): string[] {
  const norm = name.normalize('NFKC').toLowerCase();
  const collapsed = norm.replace(/[\s　]+/g, '');
  const sorted = norm.split(/[\s　]+/).filter(Boolean).sort().join('');
  return collapsed === sorted ? [collapsed] : [collapsed, sorted];
}

/** paper の DOI のうちレコードがあるものを返す (複数 DOI 登録に対応) */
function enrichmentFor(
  p: Publication,
  enrichments: ReadonlyMap<string, EnrichmentRecord>,
): EnrichmentRecord | undefined {
  for (const doi of p.dois) {
    const rec = enrichments.get(doi);
    if (rec) return rec;
  }
  return undefined;
}

export function computeSummary(
  papers: readonly Publication[],
  enrichments: ReadonlyMap<string, EnrichmentRecord>,
  options: {
    locale: 'ja' | 'en';
    /** 研究者本人の全表記バリアント (漢字・カナ・ローマ字) — parseResearcherNames の結果 */
    researcherNames: readonly string[];
    now?: Date;
  },
): SummaryMetrics {
  const now = options.now ?? new Date();
  const to = now.getFullYear();
  const from = to - 4;

  let papers5y = 0;
  let undatedCount = 0;
  let citationTotal = 0;
  let citationMatched = 0;
  let oaCount = 0;
  let oaResolvable = 0;
  let doiCount = 0;
  const missingRmIds: string[] = [];
  const recentPapers: Publication[] = [];

  for (const p of papers) {
    const year = paperYear(p);
    if (year === null) undatedCount++;
    else if (year >= from && year <= to) {
      papers5y++;
      recentPapers.push(p);
    }

    if (p.dois.length > 0) doiCount++;
    else missingRmIds.push(p.rmId);

    const rec = enrichmentFor(p, enrichments);
    if (hasCitationData(rec)) {
      citationTotal += rec.citedByCount!;
      citationMatched++;
    }
    if (rec?.found && rec.isOa !== null) {
      oaResolvable++;
      if (rec.isOa) oaCount++;
    }
  }

  // 共著者: 直近5年の著者リスト (ページ言語側を優先)、本人は全表記バリアントで除外
  // (著者リストはローマ字のことがあるため、漢字・カナ・ローマ字・語順違いを全て同一視する)
  const selfKeys = new Set(options.researcherNames.flatMap(nameKeys));
  const counts = new Map<string, { name: string; count: number }>();
  for (const p of recentPapers) {
    const authors =
      options.locale === 'en'
        ? p.authorsEn.length > 0
          ? p.authorsEn
          : p.authorsJa
        : p.authorsJa.length > 0
          ? p.authorsJa
          : p.authorsEn;
    const seenInPaper = new Set<string>();
    for (const name of authors) {
      const key = normalizeName(name);
      if (key === '' || seenInPaper.has(key)) continue;
      seenInPaper.add(key);
      if (nameKeys(name).some((k) => selfKeys.has(k))) continue;
      const entry = counts.get(key);
      if (entry) entry.count++;
      else counts.set(key, { name, count: 1 });
    }
  }
  const coauthors = [...counts.values()]
    .filter((c) => c.count >= 2) // 1 回きりの共著は「よく共著する」に含めない
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 3);

  return {
    totalPapers: papers.length,
    range: { from, to },
    papers5y,
    undatedCount,
    citations: { total: citationTotal, matched: citationMatched },
    oa: { count: oaCount, resolvable: oaResolvable },
    doi: { count: doiCount, total: papers.length, missingRmIds },
    coauthors,
  };
}
