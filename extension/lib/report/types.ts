/** 整備レポート (v0.3) のドメイン型 */

/** 外部ソースから得た「researchmap に無い可能性のある論文」候補 */
export interface ReportCandidate {
  /** 正規化済み DOI (無い場合は null — BibTeX 由来でタイトルのみのことがある) */
  doi: string | null;
  title: string;
  year: number | null;
  /** 誌名・会議名など */
  venue: string | null;
  /** "Family, Given and ..." 形式 (BibTeX 生成用) */
  authors: string | null;
  source: 'openalex-author' | 'bibtex';
}

/** OpenAlex 著者推定の結果 */
export interface AuthorInference {
  authorId: string;
  /** 同一表示名で束ねた OpenAlex 著者 ID。先頭が primary。 */
  authorIds: string[];
  displayName: string;
  /** OpenAlex 上の総論文数 */
  worksCount: number;
  /** 推定に使ったサンプル数と、その中でこの著者が現れた回数 */
  samples: number;
  votes: number;
}

export interface AuthorWorksResult {
  author: AuthorInference;
  candidates: ReportCandidate[];
}
