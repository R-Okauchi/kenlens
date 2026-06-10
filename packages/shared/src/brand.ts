/**
 * 研レンズ (KenLens) ブランド定義 — 拡張・LP・ストア文言の単一ソース。
 *
 * 配色原則: 色相は teal / green / neutral の 3 系統のみ。
 * 赤・橙・黄は全面禁止 (エラー表示も含む)。データなしは neutral gray のみ。
 * 数値の大小を色で表現しない (成績に見える表現の禁止)。
 */

export const PRODUCT_NAME_JA = '研レンズ';
export const PRODUCT_NAME_EN = 'KenLens';
export const PRODUCT_LOCKUP = '研レンズ — KenLens';

export const brand = {
  /** primary teal — host (Bootstrap 3) の青 #337ab7 と明確に区別する */
  primary: '#0F766E',
  primaryStrong: '#0B5E57',
  primarySoft: '#E6F4F2',
  gradient: 'linear-gradient(135deg, #0D9488 0%, #0EA5E9 100%)',
  gradientFrom: '#0D9488',
  gradientTo: '#0EA5E9',

  cite: { text: '#0B5E57', bg: '#E6F4F2' },
  oa: { text: '#15693B', bg: '#E7F6EC' },
  doi: { text: '#3A5276', bg: '#EEF2F8' },
  hint: { text: '#5D6B7E', bg: '#F8FAFC', border: '#8A94A4' },

  ink: '#1F2937',
  inkSoft: '#667085',
  inkFaint: '#98A2B3',
  surface: '#FFFFFF',
  surfaceSunken: '#F4F6F8',
  border: '#E4E7EC',

  tooltipBg: '#1F2937',
  tooltipText: '#FFFFFF',
  focusRing: '#0EA5E9',
} as const;

export const fontStack =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic UI", "Yu Gothic", Meiryo, sans-serif';
