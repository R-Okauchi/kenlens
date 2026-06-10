/**
 * researchmap の業績一覧 DOM の解析。
 * 常時実行する: バッジのアンカー探索と、縮退 (DOM-only) モードの完全データを兼ねる。
 *
 * 検証済み DOM 構造 (tests/fixtures/html/papers-stem-p1.html):
 *   ul.rm-cv-list-group
 *     li.list-group-item.rm-cv-disclosed...   ← サイドバーにも list-group-item があるため
 *       div.rm-cv-list-content                   必ず ul.rm-cv-list-group 内にスコープする
 *         div > a.rm-cv-list-title[href="/{permalink}/published_papers/{id}"]
 *         div.rm-cv-list-author
 *         div (クラス無し): 誌名 巻(号) ページ 日付 + span.label.rm-cv-list-label
 */
import type { DomPublication } from '../researchmap/types';

export interface ParsedListItem {
  li: HTMLElement;
  pub: DomPublication;
  /** published_papers のものだけバッジ対象 (プロフィールトップには他種別のプレビューもある) */
  listType: string | null;
}

const DETAIL_HREF_RE = /\/([a-z_]+)\/(\d+)(?:\?|$)/;

/**
 * 「2026年3月」「Mar, 2026」「2026年」等から年を抜く。
 * 日付は行末に来る (誌名中の数字と衝突し得る) ため最後のマッチを採用する。
 */
export function extractYear(metaText: string): number | null {
  const matches = [...metaText.matchAll(/(?:^|\D)((?:19|20)\d{2})(?=\D|$)/g)];
  const last = matches.at(-1);
  return last ? Number(last[1]) : null;
}

function parseItem(li: HTMLElement): ParsedListItem | null {
  const content = li.querySelector(':scope > div.rm-cv-list-content');
  if (!content) return null;

  const titleLink = content.querySelector<HTMLAnchorElement>('a.rm-cv-list-title');
  const title = titleLink?.textContent?.trim() ?? '';
  if (title === '') return null;

  let rmId: string | null = null;
  let listType: string | null = null;
  const href = titleLink?.getAttribute('href') ?? '';
  const hrefMatch = href.match(DETAIL_HREF_RE);
  if (hrefMatch) {
    listType = hrefMatch[1] ?? null;
    rmId = hrefMatch[2] ?? null;
  }

  const authorsText =
    content.querySelector('div.rm-cv-list-author')?.textContent?.trim() ?? '';

  // クラス無し div = 誌名・日付の行。タイトル行 (a を含む) と著者行を除外して探す
  let metaText = '';
  let labels: string[] = [];
  for (const div of content.querySelectorAll(':scope > div')) {
    if (div.classList.contains('rm-cv-list-author')) continue;
    if (div.querySelector('a.rm-cv-list-title')) continue;
    const labelEls = div.querySelectorAll('span.rm-cv-list-label');
    labels = [...labelEls].map((el) => el.textContent?.trim() ?? '').filter(Boolean);
    const clone = div.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('span.rm-cv-list-label').forEach((el) => el.remove());
    metaText = clone.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    break;
  }

  return {
    li,
    listType,
    pub: {
      rmId,
      title,
      authorsText,
      metaText,
      labels,
      year: extractYear(metaText),
    },
  };
}

/**
 * ページ内の業績 li をすべて解析する。
 * root はページ全体 (document) でも、MutationObserver が検出した部分木でもよい。
 */
export function parseListItems(root: ParentNode): ParsedListItem[] {
  const items: ParsedListItem[] = [];
  const lis = root.querySelectorAll<HTMLElement>(
    'ul.rm-cv-list-group > li.list-group-item',
  );
  for (const li of lis) {
    const parsed = parseItem(li);
    if (parsed) items.push(parsed);
  }
  return items;
}

/** published_papers セクションのヘッダーに出ている総件数 (任意・参考値) */
export function parseHeaderCount(doc: Document): number | null {
  const heading = doc.querySelector('#published_papers');
  const badge = heading?.querySelector('.rm-cv-header-badge');
  const n = Number(badge?.textContent?.trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * プロフィールヘッダーの研究者名の全表記バリアント (サマリーの共著者自己除外に使う)。
 * fixtures で検証済みの構造:
 * - ja: <h1 class="rm-researcher-name">山田 太郎</h1> <div class="rm-ruby">ヤマダ タロウ (Taro Yamada)</div>
 * - en: <h1 class="rm-researcher-name">Taro Yamada</h1> (山田 太郎)   ← 括弧は h1 直後のテキストノード
 * 論文の著者リストはローマ字表記のことがあるため、漢字名だけでは自己除外できない。
 */
export function parseResearcherNames(doc: Document): string[] {
  const names = new Set<string>();
  const push = (raw: string | null | undefined) => {
    if (!raw) return;
    for (const part of raw.split(/[()（）]/)) {
      const name = part.replace(/[\s　]+/g, ' ').trim();
      if (name !== '' && name.length <= 60) names.add(name);
    }
  };

  const h1 = doc.querySelector('h1.rm-researcher-name, h1');
  push(h1?.textContent);
  push(doc.querySelector('.rm-ruby')?.textContent);
  // en ページの "(漢字名)" は h1 直後のテキストノードに来る
  for (let n = h1?.nextSibling; n; n = n.nextSibling) {
    if (n.nodeType !== 3) break;
    push(n.textContent);
  }
  return [...names];
}
