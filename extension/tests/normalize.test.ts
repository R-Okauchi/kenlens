/** researchmap API 正規化のテスト (実 API レスポンス fixture に対して) */
import { describe, expect, it } from 'vitest';
import {
  normalizeListResponse,
  normalizePaper,
  type RmListResponse,
  type RmPaperRaw,
} from '../lib/researchmap/normalize';
import { fixturesAvailable, loadJson } from './helpers/fixtures';

const stem = loadJson<RmListResponse>('rm-papers-stem.json');
const hum = loadJson<RmListResponse>('rm-papers-hum.json');

describe.skipIf(!fixturesAvailable())('normalizeListResponse: STEM プロフィール (実データ)', () => {
  const { totalItems, papers } = normalizeListResponse(stem);

  it('total_items と件数を読める', () => {
    expect(totalItems).toBeGreaterThanOrEqual(papers.length);
    expect(papers).toHaveLength(stem.items?.length ?? 0); // rm:id 欠落以外は落とさない
    expect(papers.length).toBeGreaterThan(0);
  });

  it('rmId は数値文字列、タイトル/著者が入る', () => {
    const p = papers[0]!;
    expect(p.rmId).toMatch(/^\d+$/);
    expect(p.titleJa ?? p.titleEn).toBeTruthy();
    expect(p.authorsJa.length + p.authorsEn.length).toBeGreaterThan(0);
  });

  it('DOI は identifiers.doi ∪ see_also[doi] から正規化される', () => {
    const withDoi = papers.filter((p) => p.dois.length > 0);
    const rawDoiCount = (stem.items ?? []).filter(
      (i) => (i.identifiers?.doi?.length ?? 0) > 0,
    ).length;
    expect(withDoi.length).toBeGreaterThanOrEqual(rawDoiCount); // see_also 由来で増えることはあっても減らない
    for (const p of withDoi) {
      for (const doi of p.dois) expect(doi).toMatch(/^10\.\d{4,9}\/\S+$/);
    }
  });

  it('外部リンク (CiNii/Scopus等) を拾い、doi と研究課題は含めない', () => {
    const allLinks = papers.flatMap((p) => p.externalLinks);
    expect(allLinks.length).toBeGreaterThan(0);
    for (const link of allLinks) {
      expect(link.url).toMatch(/^https?:\/\//);
      expect(link.url).not.toMatch(/^https:\/\/doi\.org\//);
      expect(link.label).not.toBe('rm:research_project_id');
    }
  });
});

describe.skipIf(!fixturesAvailable())('normalizeListResponse: DOI 有無の混在', () => {
  it('DOI ありと DOI なしの論文が混在する一覧を正規化できる', () => {
    const { papers } = normalizeListResponse(hum);
    expect(papers.length).toBeGreaterThan(0);
    expect(papers.some((p) => p.dois.length === 0)).toBe(true);
    expect(papers.some((p) => p.dois.length > 0)).toBe(true);
  });
});

describe('normalizePaper: エッジケース', () => {
  it('rm:id 欠落は null', () => {
    expect(normalizePaper({} as RmPaperRaw)).toBeNull();
  });

  it('空タイトル・空著者でも壊れない', () => {
    const p = normalizePaper({
      'rm:id': 1,
      paper_title: { ja: ' ' },
      authors: { ja: [{ name: '' }] },
    });
    expect(p).not.toBeNull();
    expect(p!.titleJa).toBeNull();
    expect(p!.authorsJa).toEqual([]);
  });

  it('不正 DOI は捨て、重複は除去する', () => {
    const p = normalizePaper({
      'rm:id': 2,
      identifiers: { doi: ['10.1234/abc', 'not-a-doi'] },
      see_also: [{ label: 'doi', '@id': 'https://doi.org/10.1234/ABC' }],
    });
    expect(p!.dois).toEqual(['10.1234/abc']);
  });
});
