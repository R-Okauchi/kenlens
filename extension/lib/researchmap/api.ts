/**
 * researchmap WebAPI v2 クライアント (background SW 専用)。
 * 匿名・公開データの読み取りのみ。1 req/s に自己制限 (lib/net/queue.ts)。
 * 典型プロフィールは limit=1000 の 1 リクエストで完結する。
 */
import { HttpError, politeFetch } from '../net/queue';
import {
  normalizeListResponse,
  normalizeTitleDoiList,
  type RmOtherCategory,
  type RmListResponse,
} from './normalize';
import type { Publication, RmOtherWorks, TitleDoiIndex } from './types';

const BASE = 'https://api.researchmap.jp';
const PAGE_LIMIT = 1000;
/** start + limit ≤ 10000 (超過は 416 max_search_result) */
const MAX_WINDOW = 10_000;

export class PrivateProfileError extends Error {
  constructor(public permalink: string) {
    super(`profile not accessible: ${permalink}`);
    this.name = 'PrivateProfileError';
  }
}

export class RmApiBrokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RmApiBrokenError';
  }
}

export async function fetchAllPublications(
  permalink: string,
): Promise<{ totalItems: number; papers: Publication[] }> {
  const papers: Publication[] = [];
  let totalItems = 0;
  let start = 1;

  for (;;) {
    const url = `${BASE}/${encodeURIComponent(permalink)}/published_papers?limit=${PAGE_LIMIT}&start=${start}`;
    let res: Response;
    try {
      res = await politeFetch(url, { headers: { Accept: 'application/json' } });
    } catch (err) {
      if (err instanceof HttpError && (err.status === 403 || err.status === 404)) {
        throw new PrivateProfileError(permalink);
      }
      throw err;
    }

    const contentType = res.headers.get('Content-Type') ?? '';
    if (!contentType.includes('json')) {
      // 非 JSON 応答 = API 側の広域異常か IP ブロックの兆候 → 呼び出し側でブレーカを引く
      throw new RmApiBrokenError(`non-JSON response from ${url}`);
    }

    const json = (await res.json()) as RmListResponse;
    const page = normalizeListResponse(json);
    totalItems = page.totalItems;
    papers.push(...page.papers);

    start += PAGE_LIMIT;
    // 打ち切り判定は rawCount (正規化で rm:id 欠落 item が落ちる前の件数) で行う —
    // papers.length を使うと 1 件の不正 item で後続ページを全て取り損ねる
    const exhausted =
      page.rawCount < PAGE_LIMIT || start + PAGE_LIMIT > MAX_WINDOW;
    if (exhausted) break;
  }

  return { totalItems, papers };
}

async function fetchTitleDoiIndex(
  permalink: string,
  category: RmOtherCategory,
): Promise<TitleDoiIndex> {
  const titles: string[] = [];
  const dois: string[] = [];
  let start = 1;

  for (;;) {
    const url = `${BASE}/${encodeURIComponent(permalink)}/${category}?limit=${PAGE_LIMIT}&start=${start}`;
    const res = await politeFetch(url, { headers: { Accept: 'application/json' } });
    const contentType = res.headers.get('Content-Type') ?? '';
    if (!contentType.includes('json')) throw new RmApiBrokenError(`non-JSON response from ${url}`);

    const page = normalizeTitleDoiList(
      (await res.json()) as Parameters<typeof normalizeTitleDoiList>[0],
      category,
    );
    titles.push(...page.titles);
    dois.push(...page.dois);

    start += PAGE_LIMIT;
    if (page.rawCount < PAGE_LIMIT || start + PAGE_LIMIT > MAX_WINDOW) break;
  }

  return { titles, dois };
}

/**
 * 整備レポートの突合用に論文以外の業績索引を取る。
 * カテゴリ単位の失敗 (非公開 403/404 等) は空索引に落とす — 索引が痩せる
 * 方向の劣化であり、レポートは「未登録の可能性」としてしか提示しないので
 * 安全側。3 カテゴリ全滅はトランスポート異常とみなし null (呼び出し側で
 * 非キャッシュ・論文のみ突合に劣化)。complete=false (部分失敗) も
 * キャッシュせず次回開時に再試行させる。
 * 非 JSON 応答 (IP ブロック兆候) は RmApiBrokenError をそのまま投げる —
 * 呼び出し側で researchmap ブレーカを引く (getPublications と同じ自衛)。
 */
export async function fetchOtherWorks(
  permalink: string,
): Promise<{ works: RmOtherWorks; complete: boolean } | null> {
  const safe = async (category: RmOtherCategory): Promise<TitleDoiIndex | null> => {
    try {
      return await fetchTitleDoiIndex(permalink, category);
    } catch (err) {
      if (err instanceof RmApiBrokenError) throw err;
      return null;
    }
  };

  // politeFetch のホスト別キュー (1req/s・並列1) が直列化するので同時に投げてよい
  const [misc, books, presentations] = await Promise.all([
    safe('misc'),
    safe('books_etc'),
    safe('presentations'),
  ]);
  if (misc === null && books === null && presentations === null) return null;

  const empty: TitleDoiIndex = { titles: [], dois: [] };
  const m = misc ?? empty;
  const b = books ?? empty;
  return {
    works: {
      registered: {
        titles: [...m.titles, ...b.titles],
        dois: [...m.dois, ...b.dois],
      },
      presentations: presentations ?? empty,
    },
    complete: misc !== null && books !== null && presentations !== null,
  };
}
