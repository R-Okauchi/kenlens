/** researchmap 業績・エンリッチ結果のドメイン型。全モジュール共通の契約。 */

/** see_also から拾う外部リンク (cinii_research / scopus / web_of_science / url など) */
export interface ExternalLink {
  label: string;
  url: string;
}

/** researchmap API (または DOM) から正規化した 1 論文 */
export interface Publication {
  /** rm:id (詳細ページ URL 末尾の数値と同一。fixtures で検証済み) */
  rmId: string;
  titleJa: string | null;
  titleEn: string | null;
  authorsJa: string[];
  authorsEn: string[];
  /** YYYY | YYYY-MM | YYYY-MM-DD */
  publicationDate: string | null;
  publicationName: string | null;
  referee: boolean;
  invited: boolean;
  /** rm:is_open_access (researchmap 上の自己申告値) */
  isOaClaimed: boolean;
  /** 正規化済み DOI (小文字、https://doi.org/ 除去)。複数登録あり得る */
  dois: string[];
  externalLinks: ExternalLink[];
}

export interface PublicationsResult {
  source: 'api' | 'cache';
  fetchedAt: number;
  totalItems: number;
  papers: Publication[];
}

export interface PublicationsUnavailable {
  source: 'unavailable';
  reason: 'dom-only' | 'private' | 'error';
  /**
   * dom-only がユーザーの明示設定 (「ページ内データのみ」) によるものか。
   * true のとき content script は外部データベースへの照合も行わない
   * (設定文言「外部データベースへの接続を行いません」の遵守)。
   * キルスイッチ/ブレーカ由来の縮退では false (欧文タイトル照合は稼働する)
   */
  byUserChoice?: boolean;
}

export type GetPublicationsResponse = PublicationsResult | PublicationsUnavailable;

/** 整備レポートの突合用: タイトルと DOI だけの軽量索引 */
export interface TitleDoiIndex {
  titles: string[];
  /** 正規化済み DOI */
  dois: string[];
}

/**
 * 論文以外の業績の突合索引。
 * registered (MISC・書籍) との一致は「登録済み」として候補から除外し、
 * presentations との一致は除外せず注記に留める — 講演登録と論文登録は
 * researchmap 上で別の業績であり、論文として未登録の可能性が残るため。
 */
export interface RmOtherWorks {
  registered: TitleDoiIndex;
  presentations: TitleDoiIndex;
}

/** DOM 解析で得る 1 論文 (縮退モードの完全データ兼バッジアンカー) */
export interface DomPublication {
  rmId: string | null;
  title: string;
  authorsText: string;
  /** 誌名・巻号・日付の行 (クラス無し div のテキスト) */
  metaText: string;
  /** 査読有り / Peer-reviewed 等のラベル */
  labels: string[];
  year: number | null;
}

export type MatchStatus = 'matched' | 'mismatch-suspected' | 'unmatched';

/** DOI 1 件に対する外部 DB 照合結果 (キャッシュ単位) */
export interface EnrichmentRecord {
  doi: string;
  fetchedAt: number;
  /** どこかの DB でレコードが見つかったか */
  found: boolean;
  /** 被引用数の出典。混合加算は禁止 — UI は必ずこのラベルを表示する */
  citationSource: 'openalex' | 'crossref' | null;
  citedByCount: number | null;
  /** OpenAlex xpac (JaLC/IRDB 由来の低品質レコード)。true かつ count==0 は「データなし」扱い */
  isXpac: boolean;
  isOa: boolean | null;
  oaStatus: string | null;
  /** OA 本文への URL (best_oa_location) */
  oaUrl: string | null;
  /** OpenAlex work URL (ポップオーバーの外部リンク用) */
  openAlexUrl: string | null;
}

/** タイトル照合による DOI 候補 (整備ヒント「✎ DOI候補」) */
export interface TitleResolution {
  doi: string | null;
  confidence: number;
}

export type DataMode = 'api' | 'dom-only';
export type ModeReason = 'settings' | 'breaker' | 'remote-config' | 'default';

export interface PageContext {
  permalink: string;
  pageType: 'profile-top' | 'list';
  /** pageType === 'list' のときの業績種別 (MVP は published_papers のみ対応) */
  listType: string | null;
  lang: 'ja' | 'en';
}
