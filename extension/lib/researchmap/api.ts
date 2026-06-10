/**
 * researchmap WebAPI v2 クライアント (background SW 専用)。
 * 匿名・公開データの読み取りのみ。1 req/s に自己制限 (lib/net/queue.ts)。
 * 典型プロフィールは limit=1000 の 1 リクエストで完結する。
 */
import { HttpError, politeFetch } from '../net/queue';
import { normalizeListResponse, type RmListResponse } from './normalize';
import type { Publication } from './types';

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
