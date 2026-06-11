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

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const authorships = (...ids: string[]) => ({
  authorships: ids.map((id, i) => ({
    author: { id, display_name: id === A ? 'Taro Yamada' : `Coauthor ${i}` },
  })),
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
            meta: { next_cursor: null },
          }),
        );
      }),
    );

    const report = await buildAuthorReport(['10.1/a', '10.1/b', '10.1/c']);
    expect(report).not.toBeNull();
    expect(report!.author.authorId).toBe(A);
    expect(report!.author.worksCount).toBe(2);
    expect(report!.candidates).toHaveLength(2);

    const [withDoi, withoutDoi] = report!.candidates;
    expect(withDoi!.doi).toBe('10.1234/x1');
    expect(withDoi!.venue).toBe('Journal of Bridges');
    expect(withDoi!.source).toBe('openalex-author');
    expect(withoutDoi!.doi).toBeNull();
    expect(report!.candidates.some((c) => c.title.includes('Peer Review'))).toBe(false);
  });
});
