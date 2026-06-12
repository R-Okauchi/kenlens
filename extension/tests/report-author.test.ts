/**
 * OpenAlex 著者推定のテスト (fetch スタブ)。
 * 「本人は毎回現れ、共著者は入れ替わる」性質による多数決と、その安全弁を検証する。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { buildAuthorReport, inferAuthor } from '../lib/report/author';
import { resetQueues } from '../lib/net/queue';

const A = 'https://openalex.org/A100';
const B = 'https://openalex.org/A200';

type TestAuthor = string | { id: string; displayName: string };

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function defaultDisplayName(id: string, i: number): string {
  if (id === A) return 'Taro Yamada';
  if (id === B) return 'Hanako Sato';
  return `Fictional Author ${id.split('/').pop() ?? i}`;
}

const authorships = (...authors: TestAuthor[]) => ({
  authorships: authors.map((author, i) => {
    const id = typeof author === 'string' ? author : author.id;
    const displayName =
      typeof author === 'string' ? defaultDisplayName(id, i) : author.displayName;
    return { author: { id, display_name: displayName } };
  }),
});

beforeEach(() => {
  fakeBrowser.reset();
  resetQueues();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('inferAuthor', () => {
  it('全サンプルに現れる著者を多数決で推定する', async () => {
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        call++;
        // 本人 A は毎回、共著者 B は半分だけ現れる
        return Promise.resolve(json(call % 2 === 0 ? authorships(A, B) : authorships(A)));
      }),
    );
    const result = await inferAuthor(['10.1/a', '10.1/b', '10.1/c', '10.1/d', '10.1/e']);
    expect(result).not.toBeNull();
    expect(result!.authorId).toBe(A);
    expect(result!.authorIds).toEqual([A]);
    expect(result!.displayName).toBe('Taro Yamada');
    expect(result!.votes).toBe(5);
    expect(result!.samples).toBe(5);
  });

  it('出現率が閾値未満なら null (同名混入の安全弁)', async () => {
    const C = 'https://openalex.org/A300';
    const rotation = [A, B, C, A, B]; // 最多でも 2/5 = 40% < 60%
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        const id = rotation[call % rotation.length]!;
        call++;
        return Promise.resolve(json(authorships(id)));
      }),
    );
    const result = await inferAuthor(['10.1/a', '10.1/b', '10.1/c', '10.1/d', '10.1/e']);
    expect(result).toBeNull();
  });

  it('著者情報が空のレコード (xpac 等) は有効サンプルに数えず、先のサンプルで補う', async () => {
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        call++;
        // 最初の 3 件は著者情報なし (JaLC 系 xpac の典型)、以降は本人入り
        return Promise.resolve(json(call <= 3 ? { authorships: [] } : authorships(A)));
      }),
    );
    const result = await inferAuthor(['10.1/a', '10.1/b', '10.1/c', '10.1/d', '10.1/e', '10.1/f']);
    expect(result).not.toBeNull();
    expect(result!.authorId).toBe(A);
    expect(result!.samples).toBe(3); // 有効サンプルは後半 3 件のみ
  });

  it('同一人物の著者 ID 分裂は表示名グループで推定する', async () => {
    const splitA = 'https://openalex.org/A900001';
    const splitB = 'https://openalex.org/A900002';
    const other = 'https://openalex.org/A900003';
    const sameName = 'Mira‐ko Lane';
    const responses = [
      authorships({ id: splitA, displayName: sameName }),
      authorships({ id: splitA, displayName: sameName }),
      authorships({ id: splitA, displayName: sameName }),
      authorships({ id: splitA, displayName: sameName }),
      authorships(
        { id: splitA, displayName: sameName },
        { id: other, displayName: 'Nira Qovel' },
      ),
      authorships({ id: splitB, displayName: sameName }),
      authorships({ id: splitB, displayName: sameName }),
      authorships({ id: splitB, displayName: sameName }),
      authorships({ id: splitB, displayName: sameName }),
      authorships({ id: other, displayName: 'Nira Qovel' }),
    ];
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(json(responses[call++]!))),
    );

    const result = await inferAuthor([
      '10.1/a',
      '10.1/b',
      '10.1/c',
      '10.1/d',
      '10.1/e',
      '10.1/f',
      '10.1/g',
      '10.1/h',
      '10.1/i',
      '10.1/j',
    ]);
    expect(result).not.toBeNull();
    expect(result!.authorId).toBe(splitA);
    expect(result!.authorIds).toEqual([splitA, splitB]);
    expect(result!.displayName).toBe(sameName);
    expect(result!.votes).toBe(9);
    expect(result!.samples).toBe(10);
  });

  it('同じ work 内の同一著者 ID は 1 票だけ数える', async () => {
    const responses = [authorships(A, A), authorships(A), authorships(B)];
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(json(responses[call++]!))),
    );
    const result = await inferAuthor(['10.1/a', '10.1/b', '10.1/c']);
    expect(result).not.toBeNull();
    expect(result!.authorId).toBe(A);
    expect(result!.votes).toBe(2);
    expect(result!.samples).toBe(3);
  });

  it('サンプルが少なすぎる場合は推定しない', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(json(authorships(A)))));
    expect(await inferAuthor(['10.1/a', '10.1/b'])).toBeNull();
  });
});

describe('buildAuthorReport', () => {
  it('推定著者の全論文を候補化し、peer-review 型を除外する', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('select=authorships')) {
          return Promise.resolve(json(authorships(A)));
        }
        // 著者 works 一覧
        return Promise.resolve(
          json({
            results: [
              {
                doi: 'https://doi.org/10.1234/x1',
                title: 'Bridge Inspection with Deep Learning',
                publication_year: 2024,
                authorships: [{ author: { id: A, display_name: 'Taro Yamada' } }],
                primary_location: { source: { display_name: 'Journal of Bridges' } },
                type: 'article',
              },
              {
                doi: null,
                title: 'Peer Review #1 of Something',
                publication_year: 2024,
                type: 'peer-review',
              },
              {
                doi: null,
                title: 'A Bulletin Paper Without DOI',
                publication_year: 2019,
                authorships: [{ author: { id: A, display_name: 'Taro Yamada' } }],
                primary_location: { source: null },
                type: 'article',
              },
            ],
            meta: { count: 1200, next_cursor: null },
          }),
        );
      }),
    );

    const report = await buildAuthorReport(['10.1/a', '10.1/b', '10.1/c']);
    expect(report).not.toBeNull();
    expect(report!.author.authorId).toBe(A);
    expect(report!.author.authorIds).toEqual([A]);
    expect(report!.author.worksCount).toBe(1200);
    expect(report!.candidates).toHaveLength(2);

    const [withDoi, withoutDoi] = report!.candidates;
    expect(withDoi!.doi).toBe('10.1234/x1');
    expect(withDoi!.venue).toBe('Journal of Bridges');
    expect(withDoi!.source).toBe('openalex-author');
    expect(withoutDoi!.doi).toBeNull();
    expect(report!.candidates.some((c) => c.title.includes('Peer Review'))).toBe(false);
  });
});
