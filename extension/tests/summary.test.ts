/** サマリーメトリクスのテスト — 分母の正しさが信頼性の核 */
import { describe, expect, it } from 'vitest';
import { computeSummary, hasCitationData, paperYear } from '../lib/metrics/summary';
import type { EnrichmentRecord, Publication } from '../lib/researchmap/types';

const NOW = new Date('2026-06-10');

function paper(over: Partial<Publication>): Publication {
  return {
    rmId: over.rmId ?? String(Math.floor(Math.random() * 1e9)),
    titleJa: '題目',
    titleEn: null,
    authorsJa: [],
    authorsEn: [],
    publicationDate: null,
    publicationName: null,
    referee: false,
    invited: false,
    isOaClaimed: false,
    dois: [],
    externalLinks: [],
    ...over,
  };
}

function rec(over: Partial<EnrichmentRecord>): EnrichmentRecord {
  return {
    doi: over.doi ?? '10.1/x',
    fetchedAt: 0,
    found: true,
    citationSource: 'openalex',
    citedByCount: 0,
    isXpac: false,
    isOa: null,
    oaStatus: null,
    oaUrl: null,
    openAlexUrl: null,
    ...over,
  };
}

describe('paperYear', () => {
  it.each([
    ['2026-03', 2026],
    ['2026-03-15', 2026],
    ['2018', 2018],
    [null, null],
    ['n.d.', null],
  ])('%s → %s', (date, expected) => {
    expect(paperYear(paper({ publicationDate: date }))).toBe(expected);
  });
});

describe('computeSummary', () => {
  it('直近5年 (2022–2026): 範囲内のみ数え、日付未登録は除外して開示する', () => {
    const m = computeSummary(
      [
        paper({ publicationDate: '2026-03' }),
        paper({ publicationDate: '2022' }),
        paper({ publicationDate: '2021-12' }), // 範囲外
        paper({ publicationDate: null }), // 未登録
      ],
      new Map(),
      { locale: 'ja', researcherNames: [], now: NOW },
    );
    expect(m.range).toEqual({ from: 2022, to: 2026 });
    expect(m.papers5y).toBe(2);
    expect(m.undatedCount).toBe(1);
  });

  it('被引用合計: OpenAlex 照合分のみ。Crossref 由来と xpac ゼロは混合しない', () => {
    const p1 = paper({ rmId: '1', dois: ['10.1/a'] });
    const p2 = paper({ rmId: '2', dois: ['10.1/b'] });
    const p3 = paper({ rmId: '3', dois: ['10.1/c'] }); // crossref 由来
    const p4 = paper({ rmId: '4', dois: ['10.1/d'] }); // xpac 0 = データなし
    const enrichments = new Map<string, EnrichmentRecord>([
      ['10.1/a', rec({ doi: '10.1/a', citedByCount: 10 })],
      ['10.1/b', rec({ doi: '10.1/b', citedByCount: 0 })], // 実ゼロは算入 (matched に数える)
      ['10.1/c', rec({ doi: '10.1/c', citationSource: 'crossref', citedByCount: 99 })],
      ['10.1/d', rec({ doi: '10.1/d', isXpac: true, citedByCount: 0 })],
    ]);
    const m = computeSummary([p1, p2, p3, p4], enrichments, {
      locale: 'ja',
      researcherNames: [],
      now: NOW,
    });
    expect(m.citations.total).toBe(10);
    expect(m.citations.matched).toBe(2); // p1 + p2 (実ゼロ含む)。crossref/xpac は含めない
  });

  it('OA率: 分母は判定可能件数 (DOI なしはクローズド扱いしない)', () => {
    const papers = [
      paper({ rmId: '1', dois: ['10.1/a'] }),
      paper({ rmId: '2', dois: ['10.1/b'] }),
      paper({ rmId: '3' }), // DOI なし → 分母に入れない
    ];
    const enrichments = new Map<string, EnrichmentRecord>([
      ['10.1/a', rec({ doi: '10.1/a', isOa: true })],
      ['10.1/b', rec({ doi: '10.1/b', isOa: false })],
    ]);
    const m = computeSummary(papers, enrichments, {
      locale: 'ja',
      researcherNames: [],
      now: NOW,
    });
    expect(m.oa).toEqual({ count: 1, resolvable: 2 });
  });

  it('DOI登録: 分母は全論文。未登録の rmId を CTA 用に返す', () => {
    const m = computeSummary(
      [
        paper({ rmId: '1', dois: ['10.1/a'] }),
        paper({ rmId: '2' }),
        paper({ rmId: '3' }),
      ],
      new Map(),
      { locale: 'ja', researcherNames: [], now: NOW },
    );
    expect(m.doi.count).toBe(1);
    expect(m.doi.total).toBe(3);
    expect(m.doi.missingRmIds).toEqual(['2', '3']);
  });

  it('共著者: 直近5年・本人除外・2回以上のみ・上位3名', () => {
    const mk = (rmId: string, authors: string[]) =>
      paper({ rmId, publicationDate: '2025', authorsJa: authors });
    const m = computeSummary(
      [
        mk('1', ['研究 太郎', '山田 太郎', '佐藤 花子']),
        mk('2', ['研究 太郎', '山田 太郎', '鈴木 一']),
        mk('3', ['研究 太郎', '山田 太郎', '佐藤 花子']),
        mk('4', ['研究 太郎', '田中 二']),
        paper({ rmId: '5', publicationDate: '2010', authorsJa: ['過去 共著'] }), // 範囲外
      ],
      new Map(),
      { locale: 'ja', researcherNames: ['研究 太郎', 'ケンキュウ タロウ', 'Taro Kenkyu'], now: NOW },
    );
    expect(m.coauthors.map((c) => c.name)).toEqual(['山田 太郎', '佐藤 花子']);
    expect(m.coauthors[0]).toEqual({ name: '山田 太郎', count: 3 });
    // 本人 (研究 太郎) と 1 回きり (鈴木/田中) は含まれない
  });

  it('本人のローマ字表記・語順違いも除外する (E2E で発見した実バグの回帰テスト)', () => {
    const m = computeSummary(
      [
        paper({
          rmId: '1',
          publicationDate: '2025',
          authorsJa: ['Taro Kenkyu', '山田 太郎'], // 著者リストがローマ字のケース
        }),
        paper({
          rmId: '2',
          publicationDate: '2024',
          authorsJa: ['Kenkyu Taro', '山田 太郎'], // 語順違い
        }),
      ],
      new Map(),
      { locale: 'ja', researcherNames: ['研究 太郎', 'ケンキュウ タロウ', 'Taro Kenkyu'], now: NOW },
    );
    expect(m.coauthors.map((c) => c.name)).toEqual(['山田 太郎']);
  });

  it('表記揺れ (全角空白) は同一著者に正規化される', () => {
    const m = computeSummary(
      [
        paper({ rmId: '1', publicationDate: '2025', authorsJa: ['山田　太郎'] }),
        paper({ rmId: '2', publicationDate: '2025', authorsJa: ['山田 太郎'] }),
      ],
      new Map(),
      { locale: 'ja', researcherNames: [], now: NOW },
    );
    expect(m.coauthors).toEqual([{ name: '山田　太郎', count: 2 }]);
  });

  it('en ロケールでは英語著者リストを優先する', () => {
    const m = computeSummary(
      [
        paper({
          rmId: '1',
          publicationDate: '2025',
          authorsJa: ['山田 太郎'],
          authorsEn: ['Taro Yamada'],
        }),
        paper({
          rmId: '2',
          publicationDate: '2024',
          authorsJa: ['山田 太郎'],
          authorsEn: ['Taro Yamada'],
        }),
      ],
      new Map(),
      { locale: 'en', researcherNames: [], now: NOW },
    );
    expect(m.coauthors[0]!.name).toBe('Taro Yamada');
  });
});

describe('hasCitationData', () => {
  it('xpac の 0 はデータなし、xpac でも正の値はデータあり (参考値)', () => {
    expect(hasCitationData(rec({ isXpac: true, citedByCount: 0 }))).toBe(false);
    expect(hasCitationData(rec({ isXpac: true, citedByCount: 5 }))).toBe(true);
    expect(hasCitationData(rec({ found: false, citedByCount: null }))).toBe(false);
    expect(hasCitationData(undefined)).toBe(false);
  });
});
