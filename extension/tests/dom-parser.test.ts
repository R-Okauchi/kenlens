/**
 * dom-parser のテスト。合成 HTML ではなく実ページの fixture に対して検証する
 * (researchmap の DOM 変更はここが最初に検知する)。
 *
 * fixtures は `bash scripts/save-fixtures.sh` で取得するローカル専用データのため、
 * アサーションは特定の値に依存しない構造的なもの + ja/en・HTML/API 間のパリティで書く。
 */
import { describe, expect, it } from 'vitest';
import {
  extractYear,
  parseHeaderCount,
  parseListItems,
  parseResearcherNames,
} from '../lib/page/dom-parser';
import { fixturesAvailable, loadHtml, loadJson } from './helpers/fixtures';

describe.skipIf(!fixturesAvailable())('parseListItems: 論文一覧ページ (ja)', () => {
  const items = parseListItems(loadHtml('papers-stem-p1.html'));

  it('20件/ページをすべて検出する', () => {
    expect(items).toHaveLength(20);
  });

  it('全アイテムが数値 rmId・タイトル・published_papers 種別を持つ', () => {
    for (const { pub, listType } of items) {
      expect(pub.rmId).toMatch(/^\d+$/);
      expect(pub.title.length).toBeGreaterThan(0);
      expect(listType).toBe('published_papers');
    }
  });

  it('著者・誌名行・年・査読ラベルを抽出できる', () => {
    expect(items.some((i) => i.pub.authorsText.length > 0)).toBe(true);
    expect(items.some((i) => i.pub.metaText.length > 0)).toBe(true);
    expect(items.some((i) => i.pub.year !== null && i.pub.year > 1990)).toBe(true);
    expect(items.some((i) => i.pub.labels.includes('査読有り'))).toBe(true);
  });
});

describe.skipIf(!fixturesAvailable())('parseListItems: 英語ページは同一構造', () => {
  const ja = parseListItems(loadHtml('papers-stem-p1.html'));
  const en = parseListItems(loadHtml('papers-stem-en.html'));

  it('rmId の並びが ja と完全一致する (同一データの別言語表示)', () => {
    expect(en.map((i) => i.pub.rmId)).toEqual(ja.map((i) => i.pub.rmId));
  });

  it('ラベルはローカライズされ、年は "Mar, 2026" 形式からも取れる', () => {
    expect(en.some((i) => i.pub.labels.includes('Peer-reviewed'))).toBe(true);
    en.forEach((item, idx) => {
      expect(item.pub.year).toBe(ja[idx]!.pub.year);
    });
  });
});

describe.skipIf(!fixturesAvailable())('parseListItems: プロフィールトップ (プレビューリスト)', () => {
  it('複数セクションのプレビューを検出し、published_papers を区別できる', () => {
    const items = parseListItems(loadHtml('profile-stem.html'));
    expect(items.length).toBeGreaterThan(0);
    const types = new Set(items.map((i) => i.listType));
    expect(types.has('published_papers')).toBe(true);
  });
});

describe.skipIf(!fixturesAvailable())('403/不存在ページ', () => {
  it('何も検出しない', () => {
    expect(parseListItems(loadHtml('profile-403.html'))).toHaveLength(0);
  });
});

describe.skipIf(!fixturesAvailable())('parseHeaderCount', () => {
  it('一覧ページのヘッダー総件数が API の total_items と一致する (HTML/API パリティ)', () => {
    const apiTotal = loadJson<{ total_items?: number }>('rm-papers-stem.json').total_items;
    expect(parseHeaderCount(loadHtml('papers-stem-p1.html'))).toBe(apiTotal);
  });
});

describe.skipIf(!fixturesAvailable())('parseResearcherNames', () => {
  it('和文表記とローマ字表記の両方を収集する (自己除外の前提)', () => {
    const names = parseResearcherNames(loadHtml('profile-stem.html'));
    expect(names.length).toBeGreaterThanOrEqual(2);
    expect(names.some((n) => /[぀-ヿ一-鿿]/.test(n))).toBe(true); // 和文
    expect(names.some((n) => /^[A-Za-z][A-Za-z .'-]*$/.test(n))).toBe(true); // ローマ字
  });

  it('英語ページでも和文名 (括弧書き) を拾い、ja ページと共通の表記がある', () => {
    const ja = parseResearcherNames(loadHtml('profile-stem.html'));
    const en = parseResearcherNames(loadHtml('papers-stem-en.html'));
    expect(en.length).toBeGreaterThanOrEqual(2);
    expect(en.some((n) => ja.includes(n))).toBe(true);
  });
});

describe('extractYear', () => {
  it.each([
    ['土木学会論文集 24-J 2026年3月', 2026],
    ['Mar, 2026', 2026],
    ['2018年', 2018],
    ['Proceedings of ICCEPM 2023 2024年3月', 2024], // 誌名中の年ではなく日付側 (最後) を採る
    ['巻12 頁45-58', null],
    ['', null],
  ])('%s → %s', (input, expected) => {
    expect(extractYear(input)).toBe(expected);
  });
});
