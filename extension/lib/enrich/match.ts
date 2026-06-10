/**
 * タイトル正規化・類似度・著者ヒューリスティクス。
 * DOM item ↔ API item の突合 (rmId 一致が原則、タイトルは検算) と、
 * DOI なし欧文タイトルの Crossref 照合の受け入れ判定に使う。
 */

/**
 * NFKC 正規化 + 小文字化 + 記号→空白置換 (全角混在・約物差異を吸収する)。
 * 記号は空白に「置換」する — 除去すると "Large-Scale" が "largescale" に潰れて
 * "large scale" と不一致になるため。
 */
export function normalizeTitle(title: string): string {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** トークン Jaccard 類似度 (0–1)。日本語はトークン化できないため文字 bigram にフォールバック */
export function titleSimilarity(a: string, b: string): number {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (na === '' || nb === '') return 0;
  if (na === nb) return 1;

  const tokensOf = (s: string): Set<string> => {
    const words = s.split(' ').filter((w) => w.length > 0);
    // 空白区切りでほぼ分割できない (=日本語等) 場合は文字 bigram
    if (words.length <= 2 && s.replace(/ /g, '').length > 6) {
      const joined = s.replace(/ /g, '');
      const grams = new Set<string>();
      for (let i = 0; i < joined.length - 1; i++) grams.add(joined.slice(i, i + 2));
      return grams;
    }
    return new Set(words);
  };

  const ta = tokensOf(na);
  const tb = tokensOf(nb);
  let intersection = 0;
  for (const t of ta) if (tb.has(t)) intersection++;
  const union = ta.size + tb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** rmId 一致済みペアのタイトル検算。これ未満なら mismatch-suspected */
export const MISMATCH_THRESHOLD = 0.6;

/** タイトル照合で DOI 候補を受け入れる類似度 (年±1・筆頭姓一致も併せて要求) */
export const RESOLVE_ACCEPT_THRESHOLD = 0.9;

/** 欧文タイトルか (ASCII 英字が過半)。日本語タイトルは外部照合を試行しない */
export function isLatinTitle(title: string): boolean {
  const letters = [...title].filter((c) => /\p{L}/u.test(c));
  if (letters.length === 0) return false;
  const ascii = letters.filter((c) => /[A-Za-z]/.test(c));
  return ascii.length / letters.length > 0.5;
}

/**
 * 著者行テキストから筆頭著者の姓を推定する。
 * 欧文 "Taro Yamada, ..." → yamada / 和文 "山田 太郎, ..." → 山田
 */
export function extractFirstAuthorFamily(authorsText: string): string | null {
  const first = authorsText.split(/[,;、，]/)[0]?.trim();
  if (!first) return null;
  const parts = first.split(/[\s　]+/).filter(Boolean);
  if (parts.length === 0) return null;
  const isLatin = /^[\x20-\x7E]+$/.test(first);
  const family = isLatin ? parts.at(-1)! : parts[0]!;
  return family.normalize('NFKC').toLowerCase();
}
