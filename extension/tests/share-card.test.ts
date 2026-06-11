/** 共有カードの内容ビルダーのテスト — ガードレールが画像に必ず焼き込まれること */
import { describe, expect, it } from 'vitest';
import { DISCLAIMER } from '@kenlens/shared/disclaimer';
import { buildShareCard } from '../lib/share/card';
import type { SummaryMetrics } from '../lib/metrics/summary';

const METRICS: SummaryMetrics = {
  totalPapers: 303,
  range: { from: 2022, to: 2026 },
  papers5y: 114,
  undatedCount: 0,
  citations: { total: 1361, matched: 75 },
  oa: { count: 49, resolvable: 75 },
  doi: { count: 104, total: 303, missingRmIds: [] },
  coauthors: [{ name: '山田 太郎', count: 10 }],
};

const FETCHED_AT = new Date('2026-06-10').getTime();

describe('buildShareCard', () => {
  const ja = buildShareCard(METRICS, 'ja', FETCHED_AT);

  it('免責文 (単一ソース) とデータクレジットが必ず含まれる', () => {
    expect(ja.disclaimer).toContain(DISCLAIMER.ja);
    expect(ja.credit).toContain('Powered by researchmap');
    expect(ja.credit).toContain('OpenAlex');
  });

  it('主役タイルは DOI登録で、分数主表示 + 全件分母の脚注', () => {
    const hero = ja.tiles[0]!;
    expect(hero.value).toBe('104 / 303');
    expect(hero.label).toContain('DOI登録');
    expect(hero.label).toContain('34%'); // % は従 (ラベル側)
    expect(hero.foot).toContain('303件中');
  });

  it('被引用には照合分母が必ず併記される', () => {
    const cite = ja.tiles.find((t) => t.label.includes('被引用'))!;
    expect(cite.value).toBe('1,361');
    expect(cite.foot).toContain('75/303');
    expect(cite.foot).toContain('OpenAlex');
  });

  it('研究者名・permalink はどこにも含まれない (匿名カード)', () => {
    const all = JSON.stringify(ja);
    expect(all).not.toContain('山田');
    expect(all).not.toContain('researchmap.jp/');
  });

  it('取得時点が含まれる', () => {
    expect(ja.asOf).toContain('2026');
    expect(ja.asOf).toContain('時点');
  });

  it('OA 判定不能 (resolvable=0) は — 表示でゼロに見せない', () => {
    const m = { ...METRICS, oa: { count: 0, resolvable: 0 } };
    const card = buildShareCard(m, 'ja', FETCHED_AT);
    const oaTile = card.tiles.find((t) => t.label.includes('OA'))!;
    expect(oaTile.value).toBe('—');
    expect(oaTile.label).not.toContain('%');
  });

  it('en ロケールでも同じ構造', () => {
    const en = buildShareCard(METRICS, 'en', FETCHED_AT);
    expect(en.disclaimer).toContain(DISCLAIMER.en);
    expect(en.tiles[0]!.label).toContain('With DOI');
    expect(en.asOf).toMatch(/as of/);
  });
});
