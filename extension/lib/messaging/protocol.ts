/**
 * content script ↔ background SW のメッセージング契約。
 * 全 fetch は background に集約する (レート制限・キャッシュ・ブレーカの単一窓口)。
 * content script は ≤20 DOI ずつチャンク要求し逐次描画する。
 */
import { defineExtensionMessaging } from '@webext-core/messaging';
import type {
  DataMode,
  EnrichmentRecord,
  GetPublicationsResponse,
  ModeReason,
  RmOtherWorks,
  TitleResolution,
} from '../researchmap/types';
import type { AuthorWorksResult } from '../report/types';

export interface ProtocolMap {
  /** researchmap 業績一覧 (キャッシュ優先、1ページビューにつき 1 回) */
  getPublications(data: {
    permalink: string;
    forceRefresh?: boolean;
  }): GetPublicationsResponse;

  /** DOI チャンク (≤20) の外部 DB 照合。キー = 正規化 DOI */
  enrichDois(data: { dois: string[] }): Record<string, EnrichmentRecord>;

  /** DOI なし欧文タイトルの Crossref 照合 (ネガティブ結果も 30 日キャッシュ) */
  resolveTitleDoi(data: {
    title: string;
    year: number | null;
    firstAuthorFamily: string | null;
  }): TitleResolution;

  getMode(): { mode: DataMode; reason: ModeReason };
  clearCache(): { clearedEntries: number };
  getCacheStats(): { entries: number; approxBytes: number };

  /**
   * 整備レポート: OpenAlex 著者推定 + その著者の全論文 (researchmap との diff は
   * 呼び出し側の純関数で行う)。推定不能・DOM-only モード時は null
   */
  buildAuthorReport(data: { permalink: string }): AuthorWorksResult | null;

  /**
   * 整備レポートの突合用: MISC・書籍・講演のタイトル/DOI 索引。
   * 取得不能 (DOM-only 等) は null — diff は論文のみとの突合に劣化する
   */
  getOtherWorks(data: { permalink: string }): RmOtherWorks | null;

  /** content script からレポートページをタブで開く (CS は拡張ページを直接開けない) */
  openReport(data: { permalink: string }): void;
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
