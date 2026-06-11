/**
 * BibTeX パーサ/生成器のテスト。
 * 著者・誌名はすべて架空 (山田 太郎 / Taro Yamada 等) — 実在研究者のデータは使わない。
 */
import { describe, expect, it } from 'vitest';
import {
  candidatesFromBibtex,
  entryToCandidate,
  generateBibtex,
  parseBibtex,
} from '../lib/report/bibtex';
import type { ReportCandidate } from '../lib/report/types';

function cand(over: Partial<ReportCandidate>): ReportCandidate {
  return {
    doi: null,
    title: '無題の論文',
    year: null,
    venue: null,
    authors: null,
    source: 'bibtex',
    ...over,
  };
}

/** Google Scholar のエクスポート形式を模した架空データ (doi フィールド無し) */
const SCHOLAR_SAMPLE = `@article{yamada2024deep,
  title={Deep Learning for Riverbank Erosion Monitoring},
  author={Yamada, Taro and Sato, Hanako},
  journal={Journal of Fictitious Civil Informatics},
  volume={12},
  number={3},
  pages={45--67},
  year={2024},
  publisher={Example Press}
}

@inproceedings{sato2023graph,
  title={Graph-Based Bridge Inspection with Synthetic Data},
  author={Sato, Hanako and Suzuki, Ichiro},
  booktitle={Proceedings of the 10th Fictitious Conference on Infrastructure},
  pages={101--110},
  year={2023},
  organization={Example Society}
}
`;

describe('parseBibtex', () => {
  it('Google Scholar エクスポート (複数エントリ・doi 無し) を読める', () => {
    const entries = parseBibtex(SCHOLAR_SAMPLE);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.type).toBe('article');
    expect(entries[0]!.key).toBe('yamada2024deep');
    expect(entries[0]!.fields['title']).toBe('Deep Learning for Riverbank Erosion Monitoring');
    expect(entries[0]!.fields['author']).toBe('Yamada, Taro and Sato, Hanako');
    expect(entries[0]!.fields['year']).toBe('2024');
    expect(entries[0]!.fields['pages']).toBe('45--67');
    expect(entries[1]!.type).toBe('inproceedings');
    expect(entries[1]!.fields['booktitle']).toBe(
      'Proceedings of the 10th Fictitious Conference on Infrastructure',
    );
  });

  it('入れ子の波括弧 (title) とクォート値・裸の数値を読める', () => {
    const entries = parseBibtex(`@article{key1,
      title = {{Deep {L}earning} in {Tokyo}},
      journal = "Fictitious Letters",
      year = 1999,
    }`);
    expect(entries).toHaveLength(1);
    // title では保護用の波括弧を除去する
    expect(entries[0]!.fields['title']).toBe('Deep Learning in Tokyo');
    expect(entries[0]!.fields['journal']).toBe('Fictitious Letters');
    expect(entries[0]!.fields['year']).toBe('1999');
  });

  it('フィールド名の大文字小文字を吸収し、値の改行・連続空白を 1 個に畳む', () => {
    const entries = parseBibtex(`@ARTICLE{KEY2,
      TITLE = {Multi
        Line    Title},
      Year = {2020}
    }`);
    expect(entries[0]!.fields['title']).toBe('Multi Line Title');
    expect(entries[0]!.fields['year']).toBe('2020');
  });

  it(String.raw`LaTeX エスケープ (\& \% \_) を解除する`, () => {
    const entries = parseBibtex(
      String.raw`@article{key3, title={Health \& Safety: 100\% \_Coverage\_}, year={2021}}`,
    );
    expect(entries[0]!.fields['title']).toBe('Health & Safety: 100% _Coverage_');
  });

  it('@comment / @preamble / @string と % コメント行を読み飛ばす', () => {
    const entries = parseBibtex(`% exported by a fictitious tool
@comment{ここは {入れ子} 込みで無視される}
@preamble{ "fictitious preamble" }
@string{jfci = {Journal of Fictitious Civil Informatics}}
% @article{ghost2020, title={Ghost Entry}, year={2020}}
@article{yamada2021real,
  title={A Real Entry},
  year={2021},
}`);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.fields['title']).toBe('A Real Entry');
  });

  it('閉じ忘れ・壊れた断片があっても読める部分は返す (寛容性)', () => {
    const entries = parseBibtex(`@article{ok1, title={Fine Entry}, year={2022}}
broken text @ not-an-entry
@article{ok2, title={Another Fine Entry}, year={2023}}`);
    expect(entries.map((e) => e.fields['title'])).toEqual(['Fine Entry', 'Another Fine Entry']);
  });
});

describe('entryToCandidate', () => {
  it('title が無いエントリは null', () => {
    const entry = parseBibtex('@article{x1, author={Yamada, Taro}, year={2020}}')[0]!;
    expect(entryToCandidate(entry)).toBeNull();
  });

  it('doi は normalizeDoi で正規化され、journal が無ければ booktitle が venue になる', () => {
    const entry = parseBibtex(`@inproceedings{sato2023,
      title={Graph-Based Bridge Inspection},
      author={Sato, Hanako},
      booktitle={Proceedings of the Fictitious Conference},
      doi={https://doi.org/10.5555/FAKE.2023.001},
      year={2023}
    }`)[0]!;
    expect(entryToCandidate(entry)).toEqual({
      doi: '10.5555/fake.2023.001',
      title: 'Graph-Based Bridge Inspection',
      year: 2023,
      venue: 'Proceedings of the Fictitious Conference',
      authors: 'Sato, Hanako',
      source: 'bibtex',
    });
  });

  it('doi フィールドの無い Google Scholar 形式では doi=null のまま候補になる', () => {
    const c = entryToCandidate(parseBibtex(SCHOLAR_SAMPLE)[0]!)!;
    expect(c.doi).toBeNull();
    expect(c.title).toBe('Deep Learning for Riverbank Erosion Monitoring');
    expect(c.year).toBe(2024);
    expect(c.venue).toBe('Journal of Fictitious Civil Informatics');
    expect(c.authors).toBe('Yamada, Taro and Sato, Hanako');
  });

  it('不正な doi 値は null に落とすが候補自体は捨てない', () => {
    const entry = parseBibtex('@article{x2, title={Some Title}, doi={not-a-doi}, year={2020}}')[0]!;
    const c = entryToCandidate(entry)!;
    expect(c.doi).toBeNull();
    expect(c.title).toBe('Some Title');
  });
});

describe('candidatesFromBibtex', () => {
  it('title の無いエントリだけを除いて候補化する', () => {
    const text = `${SCHOLAR_SAMPLE}\n@misc{notitle2020, author={Yamada, Taro}, year={2020}}`;
    const cs = candidatesFromBibtex(text);
    expect(cs).toHaveLength(2);
    expect(cs.every((c) => c.source === 'bibtex')).toBe(true);
  });
});

describe('generateBibtex', () => {
  it('venue の種類で @article/@inproceedings/@misc を出し分ける', () => {
    const out = generateBibtex([
      cand({ title: 'Journal Paper', venue: 'Journal of Fictitious Civil Informatics' }),
      cand({ title: 'Conference Paper', venue: 'Proceedings of the Fictitious Conference' }),
      cand({ title: 'Venue Unknown' }),
    ]);
    expect(out).toContain('@article{');
    expect(out).toContain('@inproceedings{');
    expect(out).toContain('@misc{');
    expect(out).toContain('journal = {Journal of Fictitious Civil Informatics}');
    expect(out).toContain('booktitle = {Proceedings of the Fictitious Conference}');
  });

  it('キーは先頭著者姓+年+連番で一意化する', () => {
    const out = generateBibtex([
      cand({ title: 'First', authors: 'Yamada, Taro', year: 2024 }),
      cand({ title: 'Second', authors: 'Yamada, Taro and Sato, Hanako', year: 2024 }),
      cand({ title: 'Third', authors: 'Taro Yamada', year: 2024 }), // "Given Family" 形式でも姓を取る
    ]);
    const keys = parseBibtex(out).map((e) => e.key);
    expect(keys).toEqual(['yamada2024', 'yamada2024-2', 'yamada2024-3']);
  });

  it('ASCII に落ちない著者姓 (和文) は noauthor にフォールバックしつつ一意', () => {
    const out = generateBibtex([
      cand({ title: '和文論文 その一', authors: '山田, 太郎', year: 2024 }),
      cand({ title: '和文論文 その二', authors: '山田, 太郎', year: 2024 }),
    ]);
    const keys = parseBibtex(out).map((e) => e.key);
    expect(keys).toEqual(['noauthor2024', 'noauthor2024-2']);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it(String.raw`特殊文字 ({ } \) をエスケープし、再パースで元の値に戻る`, () => {
    const title = String.raw`Set {X} and \alpha Estimation`;
    const out = generateBibtex([cand({ title, authors: 'Yamada, Taro', year: 2024 })]);
    expect(out).toContain(String.raw`\{X\}`);
    expect(out).toContain(String.raw`\\alpha`);
    const back = candidatesFromBibtex(out);
    expect(back[0]!.title).toBe(title);
  });

  it('ラウンドトリップ: 生成 → 再パースでタイトル・年・著者・venue が保存される', () => {
    const original = candidatesFromBibtex(SCHOLAR_SAMPLE);
    const back = candidatesFromBibtex(generateBibtex(original));
    expect(back.map((c) => c.title)).toEqual(original.map((c) => c.title));
    expect(back.map((c) => c.year)).toEqual(original.map((c) => c.year));
    expect(back.map((c) => c.authors)).toEqual(original.map((c) => c.authors));
    expect(back.map((c) => c.venue)).toEqual(original.map((c) => c.venue));
  });

  it('doi 付き候補はラウンドトリップで doi も保存される', () => {
    const original = [
      cand({ title: 'With DOI', doi: '10.5555/fake.2023.001', year: 2023, authors: 'Sato, Hanako' }),
    ];
    const back = candidatesFromBibtex(generateBibtex(original));
    expect(back[0]!.doi).toBe('10.5555/fake.2023.001');
  });

  it('空配列なら空文字列', () => {
    expect(generateBibtex([])).toBe('');
  });
});
