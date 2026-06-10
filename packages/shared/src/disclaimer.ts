/**
 * 免責文・クレジット文の単一ソース。
 * サマリーカード footer / Options / Welcome / LP FAQ / ストア説明文冒頭の
 * 5 箇所すべてがここを参照する (文言の不一致はコンプライアンス事故)。
 */

export const DISCLAIMER = {
  ja: '研究評価ではなく、公開メタデータの可視化・整備支援です。',
  en: 'This is not research evaluation — it visualizes public metadata and supports profile maintenance.',
} as const;

export const POWERED_BY = {
  label: 'Powered by researchmap',
  url: 'https://researchmap.jp/',
} as const;

export const DATA_CREDITS = {
  ja: 'データ: OpenAlex・Crossref・Unpaywall',
  en: 'Data: OpenAlex, Crossref, Unpaywall',
} as const;

export const TAGLINE = {
  ja: '業績が、見える。整う。つながる。',
  en: 'See it. Tidy it. Connect it.',
} as const;

export const APP_DESC = {
  ja: 'researchmapの業績ページに被引用数・OA・DOI情報を表示します',
  en: 'Shows citations, OA status, and DOIs on researchmap profiles',
} as const;
