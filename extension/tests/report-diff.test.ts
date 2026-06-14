/**
 * 外部候補 × researchmap 業績の突合 (diffAgainstResearchmap) のテスト。
 * 研究者・論文はすべて架空。「無い」と断定しない設計 — missing は常に「未登録の可能性」。
 */
import { describe, expect, it } from 'vitest';
import { diffAgainstResearchmap } from '../lib/report/diff';
import type { ReportCandidate } from '../lib/report/types';
import type { Publication, RmOtherWorks } from '../lib/researchmap/types';

function pub(over: Partial<Publication>): Publication {
  return {
    rmId: over.rmId ?? String(Math.floor(Math.random() * 1e9)),
    titleJa: null,
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

function cand(over: Partial<ReportCandidate>): ReportCandidate {
  return {
    doi: null,
    title: '無題の候補',
    year: null,
    venue: null,
    authors: null,
    source: 'bibtex',
    ...over,
  };
}

describe('diffAgainstResearchmap', () => {
  it('DOI 完全一致は missing から除外し matchedCount に数える', () => {
    const rm = [pub({ titleEn: 'Registered Paper', dois: ['10.5555/rm.0001'] })];
    const { missing, matchedCount } = diffAgainstResearchmap(
      [cand({ doi: '10.5555/rm.0001', title: 'タイトル表記が違っていても DOI が同じなら既登録' })],
      rm,
    );
    expect(missing).toEqual([]);
    expect(matchedCount).toBe(1);
  });

  it('タイトル完全一致 (NFKC・大文字小文字・約物の揺れ) は除外する', () => {
    // 候補は正規化タイトルで重複除去されるため、揺れの種類ごとに別の rm タイトルを当てる
    const rm = [
      pub({ titleEn: 'Deep Learning for Bridge Inspection' }),
      pub({ titleEn: 'Graph-Based Crack Detection' }),
      pub({ titleEn: 'Fictitious Tunnel Survey' }),
      pub({ titleJa: '橋梁点検の自動化に関する研究' }),
    ];
    const { missing, matchedCount } = diffAgainstResearchmap(
      [
        cand({ title: 'deep learning for bridge inspection' }), // 小文字
        cand({ title: 'Graph Based Crack Detection' }), // ハイフン ↔ 空白
        cand({ title: 'Ｆｉｃｔｉｔｉｏｕｓ Ｔｕｎｎｅｌ Ｓｕｒｖｅｙ' }), // 全角 (NFKC)
        cand({ title: '橋梁点検の自動化に関する研究。' }), // 句点付き
      ],
      rm,
    );
    expect(missing).toEqual([]);
    expect(matchedCount).toBe(4);
  });

  it('完全一致しなくても類似度 0.9 以上なら表記揺れとして除外する', () => {
    // rm 側 10 トークン、候補は +1 トークン → Jaccard 10/11 ≈ 0.909 ≥ 0.9
    const rm = [
      pub({ titleEn: 'Deep Learning for Riverbank Erosion Monitoring in Mountainous River Basins' }),
    ];
    const { missing, matchedCount } = diffAgainstResearchmap(
      [
        cand({
          title:
            'Deep Learning for Riverbank Erosion Monitoring in Mountainous River Basins Study',
        }),
      ],
      rm,
    );
    expect(missing).toEqual([]);
    expect(matchedCount).toBe(1);
  });

  it('未登録の可能性がある候補のみ残り、年降順 (年不明は末尾) で返す', () => {
    const { missing, matchedCount } = diffAgainstResearchmap(
      [
        cand({ title: 'Acoustic Sensing of Fictitious Tunnels', year: 2020 }),
        cand({ title: '河川堤防の植生変化の定点観測', year: null }),
        cand({ title: 'Synthetic Pavement Crack Dataset', year: 2024 }),
        cand({ title: 'Fictitious Levee Health Records', year: 2022 }),
      ],
      [pub({ titleEn: 'A Completely Unrelated Registered Paper' })],
    );
    expect(missing.map((c) => c.year)).toEqual([2024, 2022, 2020, null]);
    expect(matchedCount).toBe(0);
  });

  it('候補同士の重複は DOI または正規化タイトル+年で除去する', () => {
    const { missing, matchedCount } = diffAgainstResearchmap(
      [
        // 同一 DOI (タイトル表記違い)
        cand({ doi: '10.5555/dup.0001', title: 'A Novel Fictitious Method' }),
        cand({ doi: '10.5555/dup.0001', title: 'A novel fictitious method (preprint)' }),
        // DOI 無し・正規化タイトルと年が同一
        cand({ title: 'Bridge Vibration Atlas', year: 2023 }),
        cand({ title: 'bridge vibration atlas!', year: 2023 }),
      ],
      [],
    );
    expect(missing).toHaveLength(2);
    // 年降順ソート: 2023 の Bridge が先、年なしの Novel は末尾
    expect(missing.map((c) => c.title)).toEqual([
      'Bridge Vibration Atlas',
      'A Novel Fictitious Method',
    ]);
    expect(matchedCount).toBe(0);
  });

  it('同タイトル・同年の重複は DOI を持つ候補を優先して残す', () => {
    const { missing, matchedCount } = diffAgainstResearchmap(
      [
        cand({ title: 'Fictitious Sensor Fusion Study', year: 2024 }),
        cand({
          doi: '10.5555/fusion.2024',
          title: 'Fictitious Sensor Fusion Study',
          year: 2024,
        }),
      ],
      [],
    );
    expect(missing).toHaveLength(1);
    expect(missing[0]!.doi).toBe('10.5555/fusion.2024');
    expect(missing[0]!.title).toBe('Fictitious Sensor Fusion Study');
    expect(matchedCount).toBe(0);
  });

  it('同タイトルでも年が異なる候補は別行として残す', () => {
    const { missing, matchedCount } = diffAgainstResearchmap(
      [
        cand({ title: 'Fictitious Coastal Monitoring Study', year: 2023 }),
        cand({ title: 'Fictitious Coastal Monitoring Study', year: 2024 }),
      ],
      [],
    );
    expect(missing.map((c) => c.year)).toEqual([2024, 2023]);
    expect(missing.map((c) => c.title)).toEqual([
      'Fictitious Coastal Monitoring Study',
      'Fictitious Coastal Monitoring Study',
    ]);
    expect(matchedCount).toBe(0);
  });

  it('タイトルが空に正規化される候補は matched にも missing にも入れない (沈黙)', () => {
    const { missing, matchedCount } = diffAgainstResearchmap([cand({ title: '※☆' })], []);
    expect(missing).toEqual([]);
    expect(matchedCount).toBe(0);
  });

  it('matchedCount は DOI 一致 + タイトル一致 + 類似一致の合計になる', () => {
    const rm = [
      pub({ titleEn: 'Fictitious Bridge Monitoring with Acoustic Sensors', dois: ['10.5555/aa'] }),
      pub({ titleEn: 'Deep Learning for Riverbank Erosion Monitoring in Mountainous River Basins' }),
    ];
    const { missing, matchedCount } = diffAgainstResearchmap(
      [
        cand({ doi: '10.5555/aa', title: 'タイトル不問の DOI 一致' }), // DOI 一致
        cand({ title: 'Fictitious Bridge Monitoring with Acoustic Sensors!' }), // 正規化タイトル一致
        cand({
          title:
            'Deep Learning for Riverbank Erosion Monitoring in Mountainous River Basins Study',
        }), // 類似度 ≥ 0.9
        cand({ title: '全く新しい架空の研究ノート', year: 2025 }), // 真に未登録の可能性
      ],
      rm,
    );
    expect(matchedCount).toBe(3);
    expect(missing.map((c) => c.title)).toEqual(['全く新しい架空の研究ノート']);
  });
});

describe('diffAgainstResearchmap: 論文以外の業績との突合', () => {
  const emptyIndex = { titles: [], dois: [] };

  function others(over: Partial<RmOtherWorks>): RmOtherWorks {
    return { registered: emptyIndex, presentations: emptyIndex, ...over };
  }

  it('MISC・書籍のタイトル/DOI に一致する候補は登録済みとして除外する', () => {
    const { missing, matchedCount } = diffAgainstResearchmap(
      [
        cand({ title: '架空のインフラ点検解説 (連載第3回)' }), // misc タイトル一致
        cand({ doi: '10.5555/book.0001', title: 'Some Chapter With Different Title' }), // 書籍 DOI 一致
        cand({ title: '真に未登録の架空論文', year: 2025 }),
      ],
      [],
      others({
        registered: {
          titles: ['架空のインフラ点検解説 (連載第3回)'],
          dois: ['10.5555/book.0001'],
        },
      }),
    );
    expect(matchedCount).toBe(2);
    expect(missing.map((c) => c.title)).toEqual(['真に未登録の架空論文']);
  });

  it('講演とのみ一致する候補は除外せず presentationMatch を立てる', () => {
    const { missing, matchedCount } = diffAgainstResearchmap(
      [
        cand({ title: 'Fictitious Conference Talk on Sensing', year: 2024 }),
        cand({ title: '講演と無関係な架空論文', year: 2023 }),
      ],
      [],
      others({
        presentations: { titles: ['Fictitious Conference Talk on Sensing'], dois: [] },
      }),
    );
    expect(matchedCount).toBe(0);
    expect(missing.map((c) => [c.title, c.presentationMatch])).toEqual([
      ['Fictitious Conference Talk on Sensing', true],
      ['講演と無関係な架空論文', false],
    ]);
  });

  it('論文一致が講演一致より優先される (除外 > 注記)', () => {
    const { missing, matchedCount } = diffAgainstResearchmap(
      [cand({ title: 'Dual Registered Fictitious Study' })],
      [pub({ titleEn: 'Dual Registered Fictitious Study' })],
      others({
        presentations: { titles: ['Dual Registered Fictitious Study'], dois: [] },
      }),
    );
    expect(matchedCount).toBe(1);
    expect(missing).toEqual([]);
  });

  it('otherWorks 未取得 (null) は論文のみ突合に劣化し comparedOtherWorks=false', () => {
    const withOthers = diffAgainstResearchmap([cand({ title: 'X 架空' })], [], others({}));
    const withoutOthers = diffAgainstResearchmap([cand({ title: 'X 架空' })], []);
    expect(withOthers.comparedOtherWorks).toBe(true);
    expect(withoutOthers.comparedOtherWorks).toBe(false);
  });
});
