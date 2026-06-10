/**
 * URL + DOM マーカーからページ種別を判定する。
 * 判定できないページ (403・予約ルート・非プロフィール) では null を返し、何も注入しない。
 *
 * 検証済み事実 (tests/fixtures):
 * - プロフィール: https://researchmap.jp/{permalink}
 * - 一覧: /{permalink}/published_papers (ページングは ?limit&start)
 * - 403/不存在ページには .rm-cv-panel-heading / .rm-cv-list-group が存在しない
 */
import type { PageContext } from '../researchmap/types';

/** プロフィールではないことが既知の第一パスセグメント */
const RESERVED_SEGMENTS = new Set([
  'public',
  'researchers',
  'achievements',
  'communities',
  'community',
  'outline',
  'blogs',
  'search',
  'signin',
  'signout',
  'login',
  'portal',
  'inquiry',
  'cabinets',
  'institutions',
]);

/** MVP でバッジ対象にする業績種別 */
export const SUPPORTED_LIST_TYPES = new Set(['published_papers']);

const PERMALINK_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function detectPage(loc: Location | URL, doc: Document): PageContext | null {
  const url = loc instanceof URL ? loc : new URL(loc.href);
  if (url.hostname !== 'researchmap.jp') return null;

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length === 0 || segments.length > 2) return null;

  const permalink = decodeURIComponent(segments[0]!);
  if (RESERVED_SEGMENTS.has(permalink) || !PERMALINK_RE.test(permalink)) return null;

  // DOM マーカーゲート: 業績パネルが無いページ (403 等) には注入しない
  const hasCvMarker =
    doc.querySelector('.rm-cv-panel-heading') !== null ||
    doc.querySelector('ul.rm-cv-list-group') !== null;
  if (!hasCvMarker) return null;

  const lang: PageContext['lang'] = doc.documentElement.lang
    ?.toLowerCase()
    .startsWith('en')
    ? 'en'
    : 'ja';

  if (segments.length === 1) {
    return { permalink, pageType: 'profile-top', listType: null, lang };
  }

  const listType = segments[1]!;
  if (!SUPPORTED_LIST_TYPES.has(listType)) return null;
  return { permalink, pageType: 'list', listType, lang };
}
