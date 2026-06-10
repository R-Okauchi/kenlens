/** レート制限・リトライ・ブレーカのテスト (fake timers + fetch スタブ) */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import {
  BreakerOpenError,
  HttpError,
  isBreakerOpen,
  politeFetch,
  resetQueues,
} from '../lib/net/queue';

const URL_RM = 'https://api.researchmap.jp/test/published_papers';

function mockResponse(status: number, headers: Record<string, string> = {}): Response {
  return new Response(status === 204 ? null : '{}', { status, headers });
}

beforeEach(() => {
  vi.useFakeTimers();
  resetQueues();
  fakeBrowser.reset(); // ブレーカ永続化 (kl:net-breakers) をテスト間で隔離する
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('politeFetch', () => {
  it('成功レスポンスをそのまま返す', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(200));
    vi.stubGlobal('fetch', fetchMock);
    const promise = politeFetch(URL_RM);
    await vi.runAllTimersAsync();
    const res = await promise;
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('同一ホストへの連続リクエストは minInterval (researchmap=1s) 空ける', async () => {
    const timestamps: number[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        timestamps.push(Date.now());
        return Promise.resolve(mockResponse(200));
      }),
    );
    const p = Promise.all([politeFetch(URL_RM), politeFetch(URL_RM)]);
    await vi.runAllTimersAsync();
    await p;
    expect(timestamps).toHaveLength(2);
    expect(timestamps[1]! - timestamps[0]!).toBeGreaterThanOrEqual(1000);
  });

  it('429 は Retry-After を尊重してリトライし、回復したら成功する', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(429, { 'Retry-After': '2' }))
      .mockResolvedValueOnce(mockResponse(200));
    vi.stubGlobal('fetch', fetchMock);
    const promise = politeFetch(URL_RM);
    await vi.runAllTimersAsync();
    const res = await promise;
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('404 は即 HttpError を投げ、リトライもブレーカ加算もしない', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(404));
    vi.stubGlobal('fetch', fetchMock);
    const promise = politeFetch(URL_RM).catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    const err = await promise;
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(isBreakerOpen('api.researchmap.jp')).toBe(false);
  });

  it('5xx が3連続でブレーカが開き、残りの試行も以後のリクエストも即座に拒否する', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(500));
    vi.stubGlobal('fetch', fetchMock);
    const promise = politeFetch(URL_RM).catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    // 3 連続失敗でブレーカが開き、4 回目の試行はループ内チェックで止まる
    expect(await promise).toBeInstanceOf(BreakerOpenError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(isBreakerOpen('api.researchmap.jp')).toBe(true);

    const second = politeFetch(URL_RM).catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    expect(await second).toBeInstanceOf(BreakerOpenError);
  });

  it('ブレーカ開放時刻は storage に永続化され、SW 再起動 (メモリ消失) 後も効く', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(500)));
    const p = politeFetch(URL_RM).catch(() => null);
    await vi.runAllTimersAsync();
    await p;
    expect(isBreakerOpen('api.researchmap.jp')).toBe(true);

    resetQueues(); // SW 再起動をシミュレート (メモリ状態のみ消える)
    expect(isBreakerOpen('api.researchmap.jp')).toBe(false); // メモリは空だが…
    const after = politeFetch(URL_RM).catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    expect(await after).toBeInstanceOf(BreakerOpenError); // storage から復元される
  });

  it('ブレーカは他ホストに波及しない', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(500)));
    const p = politeFetch(URL_RM).catch(() => null);
    await vi.runAllTimersAsync();
    await p;
    expect(isBreakerOpen('api.openalex.org')).toBe(false);
  });
});
