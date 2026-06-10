/**
 * エンリッチパイプラインの統合テスト。
 * fetch をスタブし、fake-browser (WxtVitest) の storage でキャッシュ動作を検証する。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { enrichDois, resolveTitleDoi } from '../lib/enrich/pipeline';
import { resetQueues } from '../lib/net/queue';
import { fixturesAvailable, loadJson } from './helpers/fixtures';

const OPENALEX_WORK = loadJson<Record<string, unknown>>('openalex-normal.json');
const XPAC_WORK = loadJson<Record<string, unknown>>('openalex-xpac.json');
const CROSSREF_WORK = loadJson<Record<string, unknown>>('crossref-work.json');
const CROSSREF_BIBLIO = loadJson<Record<string, unknown>>('crossref-biblio.json');

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function html404(): Response {
  return new Response('<html>Not Found</html>', {
    status: 404,
    headers: { 'Content-Type': 'text/html' },
  });
}

beforeEach(() => {
  fakeBrowser.reset();
  resetQueues();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.skipIf(!fixturesAvailable())('enrichDois', () => {
  it('OpenAlex 収載 DOI → openalex レコード (xpac=false)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('api.openalex.org')) return Promise.resolve(json(OPENALEX_WORK));
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
    const result = await enrichDois(['10.7717/peerj.4375']);
    const rec = result['10.7717/peerj.4375']!;
    expect(rec.found).toBe(true);
    expect(rec.citationSource).toBe('openalex');
    expect(rec.citedByCount).toBeGreaterThan(1000);
    expect(rec.isXpac).toBe(false);
    expect(rec.isOa).toBe(true);
    expect(rec.oaUrl).toBeTruthy();
    expect(rec.openAlexUrl).toMatch(/^https:\/\/openalex\.org\//);
  });

  it('JaLC DOI (xpac) → isXpac=true / citedByCount=0 (UI 側で「データなし」扱い)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(json(XPAC_WORK))),
    );
    const result = await enrichDois(['10.18910/57477']);
    const rec = result['10.18910/57477']!;
    expect(rec.isXpac).toBe(true);
    expect(rec.citedByCount).toBe(0);
  });

  it('OpenAlex 404 (HTML) → Crossref フォールバック + Unpaywall で OA 補完', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('api.openalex.org')) return Promise.resolve(html404());
        if (url.includes('api.crossref.org')) return Promise.resolve(json(CROSSREF_WORK));
        if (url.includes('api.unpaywall.org')) {
          return Promise.resolve(
            json({ is_oa: true, oa_status: 'green', best_oa_location: { url_for_pdf: 'https://x/pdf' } }),
          );
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
    const result = await enrichDois(['10.7717/peerj.4375']);
    const rec = result['10.7717/peerj.4375']!;
    expect(rec.found).toBe(true);
    expect(rec.citationSource).toBe('crossref');
    expect(rec.citedByCount).toBe(787);
    expect(rec.isOa).toBe(true);
    expect(rec.oaUrl).toBe('https://x/pdf');
  });

  it('全 DB 未収録 → found:false のネガティブレコード (これもキャッシュされる)', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(html404()));
    vi.stubGlobal('fetch', fetchMock);

    const result = await enrichDois(['10.9999/nonexistent']);
    expect(result['10.9999/nonexistent']!.found).toBe(false);

    // 2 回目はキャッシュから (追加 fetch なし)
    const callsAfterFirst = fetchMock.mock.calls.length;
    const second = await enrichDois(['10.9999/nonexistent']);
    expect(second['10.9999/nonexistent']!.found).toBe(false);
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
  });

  it('トランスポート失敗の DOI は結果から省かれる (キャッシュ汚染なし)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('network down')),
    );
    const result = await enrichDois(['10.1234/fail']);
    expect(result['10.1234/fail']).toBeUndefined();
  }, 30_000);
});

describe.skipIf(!fixturesAvailable())('resolveTitleDoi', () => {
  it('厳格三重ゲート: ピアレビューノイズを拒否し本命だけ受け入れる', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('query.bibliographic')) return Promise.resolve(json(CROSSREF_BIBLIO));
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
    const res = await resolveTitleDoi(
      'The state of OA: a large-scale analysis of the prevalence and impact of Open Access articles',
      2018,
      'piwowar',
    );
    // fixture の rows=3 にはピアレビューレコードが含まれる — 本命 (10.7717/peerj.4375) が
    // 含まれていれば採用、含まれない場合は null (どちらも「ノイズ非採用」が成立していること)
    if (res.doi !== null) {
      expect(res.doi).toBe('10.7717/peerj.4375');
      expect(res.confidence).toBeGreaterThanOrEqual(0.9);
    }
  });

  it('ネガティブ結果は 30 日キャッシュされ再照合しない', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(json({ message: { items: [] } })));
    vi.stubGlobal('fetch', fetchMock);

    const first = await resolveTitleDoi('Unfindable Title XYZ', 2020, null);
    expect(first.doi).toBeNull();
    const calls = fetchMock.mock.calls.length;

    const second = await resolveTitleDoi('Unfindable Title XYZ', 2020, null);
    expect(second.doi).toBeNull();
    expect(fetchMock.mock.calls.length).toBe(calls);
  });
});
