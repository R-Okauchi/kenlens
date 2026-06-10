/** DOI 文字列の正規化と検証 */

const DOI_RE = /^10\.\d{4,9}\/\S+$/;

/** "https://doi.org/10.X/Y" / "doi:10.X/Y" / 大文字混在 → "10.x/y"。不正なら null */
export function normalizeDoi(raw: string): string | null {
  let doi = raw.trim();
  doi = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
  doi = doi.replace(/^doi:\s*/i, '');
  doi = doi.toLowerCase();
  return DOI_RE.test(doi) ? doi : null;
}

export function dedupeDois(raws: readonly string[]): string[] {
  const out = new Set<string>();
  for (const raw of raws) {
    const doi = normalizeDoi(raw);
    if (doi) out.add(doi);
  }
  return [...out];
}
