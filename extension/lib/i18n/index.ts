/**
 * i18n ランタイム。ロケール解決: settings.language === 'auto' ? ページ言語 : 設定値。
 * ページ言語は document.documentElement.lang (researchmap は ja / en を返す。fixtures で検証済み)。
 */
import { createContext, useContext } from 'react';
import { messages, type Locale, type Messages } from './messages';

export type { Locale, Messages };

export function detectPageLocale(doc: Document = document): Locale {
  return doc.documentElement.lang?.toLowerCase().startsWith('en') ? 'en' : 'ja';
}

export function resolveLocale(
  setting: 'auto' | Locale,
  pageLocale: Locale,
): Locale {
  return setting === 'auto' ? pageLocale : setting;
}

/** {n} 形式のプレースホルダを展開する */
export function format(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, key: string) =>
    key in params ? String(params[key]) : m,
  );
}

export function t(
  locale: Locale,
  key: keyof Messages,
  params?: Record<string, string | number>,
): string {
  return format(messages[locale][key], params);
}

/** 取得時点の表示 (ja: 2026/6/8 / en: Jun 8, 2026) */
export function formatDate(locale: Locale, epochMs: number): string {
  const d = new Date(epochMs);
  if (locale === 'ja') return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export const LocaleContext = createContext<Locale>('ja');

export function useI18n() {
  const locale = useContext(LocaleContext);
  return {
    locale,
    t: (key: keyof Messages, params?: Record<string, string | number>) =>
      t(locale, key, params),
    formatDate: (epochMs: number) => formatDate(locale, epochMs),
  };
}
