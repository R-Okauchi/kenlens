/**
 * background メッセージハンドラ + alarm。
 * SW はアイドル 30 秒で死ぬ — 状態は storage に持ち、ハンドラは毎回ステートレスに動く。
 */
import { browser } from 'wxt/browser';
import { TTL, cacheGetWithAge, cacheKey, cacheSet, clearAll, evict, stats } from '../cache/store';
import { enrichDois, resolveTitleDoi } from '../enrich/pipeline';
import {
  refreshRemoteConfig,
  refreshRemoteConfigIfStale,
  resolveMode,
  tripResearchmapBreaker,
} from '../flags/flags';
import { onMessage } from '../messaging/protocol';
import { BreakerOpenError, HttpError } from '../net/queue';
import { buildAuthorReport } from '../report/author';
import type { AuthorWorksResult } from '../report/types';
import {
  PrivateProfileError,
  RmApiBrokenError,
  fetchAllPublications,
} from '../researchmap/api';
import type { GetPublicationsResponse, Publication } from '../researchmap/types';
import { getSettings } from '../settings/settings';

const ALARM_EVICTION = 'kl-eviction';
const ALARM_REMOTE_CONFIG = 'kl-remote-config';

interface RmCacheValue {
  totalItems: number;
  papers: Publication[];
}

/** 同一 permalink の同時要求 (複数タブ) を 1 回の researchmap 取得に束ねる */
const inflight = new Map<string, Promise<GetPublicationsResponse>>();

async function getPublications(
  permalink: string,
  forceRefresh: boolean,
): Promise<GetPublicationsResponse> {
  const settings = await getSettings();
  const { mode } = await resolveMode(settings);
  if (mode === 'dom-only') return { source: 'unavailable', reason: 'dom-only' };

  // キルスイッチの到達性保証 (alarm が取りこぼされても日次で必ず確認される)
  void refreshRemoteConfigIfStale();

  const key = cacheKey('rm', permalink);
  if (!forceRefresh) {
    const cached = await cacheGetWithAge<RmCacheValue>(key, TTL.rm);
    if (cached) {
      return {
        source: 'cache',
        fetchedAt: cached.fetchedAt,
        totalItems: cached.value.totalItems,
        papers: cached.value.papers,
      };
    }
  }

  const existing = inflight.get(permalink);
  if (existing && !forceRefresh) return existing;

  const promise = (async (): Promise<GetPublicationsResponse> => {
    try {
      const { totalItems, papers } = await fetchAllPublications(permalink);
      await cacheSet<RmCacheValue>(key, { totalItems, papers });
      return { source: 'api', fetchedAt: Date.now(), totalItems, papers };
    } catch (err) {
      if (err instanceof PrivateProfileError) {
        return { source: 'unavailable', reason: 'private' };
      }
      // 広域異常の兆候 → 6h 自動縮退 (ToS 自衛):
      // 非 JSON 応答 (IP ブロック)・リトライ後も続く 429/5xx・ブレーカ開放
      if (
        err instanceof RmApiBrokenError ||
        err instanceof BreakerOpenError ||
        (err instanceof HttpError && (err.status === 429 || err.status >= 500))
      ) {
        await tripResearchmapBreaker();
      }
      return { source: 'unavailable', reason: 'error' };
    } finally {
      inflight.delete(permalink);
    }
  })();
  inflight.set(permalink, promise);
  return promise;
}

/** alarm は存在しない場合のみ作成する — SW 起動ごとの create は周期タイマーを巻き戻し、
 *  アクティブユーザーほど 24h alarm が永遠に発火しなくなるため */
async function ensureAlarm(name: string, periodInMinutes: number): Promise<void> {
  const existing = await browser.alarms.get(name);
  if (!existing) await browser.alarms.create(name, { periodInMinutes });
}

export function registerBackgroundHandlers(): void {
  onMessage('getPublications', ({ data }) =>
    getPublications(data.permalink, data.forceRefresh === true),
  );

  onMessage('enrichDois', ({ data }) => enrichDois(data.dois));

  onMessage('resolveTitleDoi', ({ data }) =>
    resolveTitleDoi(data.title, data.year, data.firstAuthorFamily),
  );

  onMessage('getMode', async () => resolveMode(await getSettings()));

  onMessage('clearCache', async () => ({ clearedEntries: await clearAll() }));

  onMessage('getCacheStats', () => stats());

  onMessage('buildAuthorReport', async ({ data }) => {
    const key = cacheKey('report', data.permalink);
    const cached = await cacheGetWithAge<AuthorWorksResult | null>(key, TTL.report);
    if (cached) return cached.value;

    const pubs = await getPublications(data.permalink, false);
    if (pubs.source === 'unavailable') return null;
    const dois = [...new Set(pubs.papers.flatMap((p) => p.dois))];
    if (dois.length === 0) return null;

    const report = await buildAuthorReport(dois);
    // 推定失敗 (null) はキャッシュしない — 一時的な API 不調でも 24h 再試行不能になるため
    if (report !== null) await cacheSet(key, report);
    return report;
  });

  onMessage('openReport', ({ data }) => {
    void browser.tabs.create({
      url: browser.runtime.getURL(
        `/report.html?permalink=${encodeURIComponent(data.permalink)}` as '/report.html',
      ),
    });
  });

  // 日次: キャッシュ退避 + リモート設定 (キルスイッチ) 更新
  void ensureAlarm(ALARM_EVICTION, 24 * 60);
  void ensureAlarm(ALARM_REMOTE_CONFIG, 24 * 60);
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_EVICTION) void evict();
    if (alarm.name === ALARM_REMOTE_CONFIG) void refreshRemoteConfig();
  });

  browser.runtime.onInstalled.addListener((details) => {
    void refreshRemoteConfig();
    if (details.reason === 'install') {
      void browser.tabs.create({
        url: browser.runtime.getURL('/welcome.html'),
      });
    }
  });
}
