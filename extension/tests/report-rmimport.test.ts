/** researchmap インポート用 JSONL 生成のテスト (v2API.pdf §3.1.3 形式) */
import { describe, expect, it } from 'vitest';
import { generateRmImportJsonl } from '../lib/report/rmImport';
import type { ReportCandidate } from '../lib/report/types';

function candidate(over: Partial<ReportCandidate>): ReportCandidate {
  return {
    doi: null,
    title: 'A Fictitious Paper on Bridge Inspection',
    year: 2024,
    venue: null,
    authors: null,
    source: 'openalex-author',
    ...over,
  };
}

describe('generateRmImportJsonl', () => {
  it('1 行 1 業績の JSONL で、insert + similar_merge(input_data) 形式', () => {
    const { jsonl, included } = generateRmImportJsonl([
      candidate({ doi: '10.1234/a', venue: 'Journal of Tests', authors: 'Taro Yamada and Hanako Sato' }),
      candidate({ title: '架空の橋梁点検に関する研究', year: 2020 }),
    ]);
    const lines = jsonl.trim().split('\n');
    expect(included).toBe(2);
    expect(lines).toHaveLength(2);

    const first = JSON.parse(lines[0]!);
    expect(first.insert).toEqual({ type: 'published_papers' });
    expect(first.priority).toBe('input_data');
    expect(first.similar_merge.publication_date).toBe('2024');
    expect(first.similar_merge.identifiers).toEqual({ doi: ['10.1234/a'] });
  });

  it('欧文は en、和文は ja に振り分ける (タイトル・誌名・著者)', () => {
    const { jsonl } = generateRmImportJsonl([
      candidate({ venue: 'Journal of Tests', authors: 'Taro Yamada and Hanako Sato' }),
      candidate({ title: '架空の橋梁点検に関する研究', venue: '架空学会論文集', authors: '山田 太郎 and 佐藤 花子' }),
    ]);
    const [en, ja] = jsonl.trim().split('\n').map((l) => JSON.parse(l));
    expect(en.similar_merge.paper_title.en).toBeTruthy();
    expect(en.similar_merge.paper_title.ja).toBeUndefined();
    expect(en.similar_merge.authors.en).toEqual([{ name: 'Taro Yamada' }, { name: 'Hanako Sato' }]);
    expect(ja.similar_merge.paper_title.ja).toBe('架空の橋梁点検に関する研究');
    expect(ja.similar_merge.publication_name.ja).toBe('架空学会論文集');
    expect(ja.similar_merge.authors.ja).toEqual([{ name: '山田 太郎' }, { name: '佐藤 花子' }]);
  });

  it('出版年不明の候補は含めず、件数を開示する (researchmap 側で必須項目のため)', () => {
    const { included, skippedNoDate, jsonl } = generateRmImportJsonl([
      candidate({}),
      candidate({ year: null }),
    ]);
    expect(included).toBe(1);
    expect(skippedNoDate).toBe(1);
    expect(jsonl.trim().split('\n')).toHaveLength(1);
  });

  it('改行を含むタイトルでも 1 行 1 業績が保たれる (JSON.stringify が \\n にエスケープ)', () => {
    const { jsonl } = generateRmImportJsonl([candidate({ title: 'Line1\nLine2 of Fictitious Title' })]);
    expect(jsonl.trim().split('\n')).toHaveLength(1);
  });

  it('空入力は空文字列', () => {
    const { jsonl, included } = generateRmImportJsonl([]);
    expect(jsonl).toBe('');
    expect(included).toBe(0);
  });
});
