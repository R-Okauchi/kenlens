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
  fetchOtherWorks,
} from '../researchmap/api';
import type {
  GetPublicationsResponse,
  Publication,
  RmOtherWorks,
} from '../researchmap/types';
import { getSettings } from '../settings/settings';

const ALARM_EVICTION = 'kl-eviction';
const ALARM_REMOTE_CONFIG = 'kl-remote-config';

interface RmCacheValue {
  totalItems: number;
  papers: Publication[];
}

/** 同一 permalink の同時要求 (複数タブ) を 1 回の researchmap 取得に束ねる */
const inflight = new Map<string, Promise<GetPublicationsResponse>>();
const otherWorksInflight = new Map<string, Promise<RmOtherWorks | null>>();
const reportInflight = new Map<string, Promise<AuthorWorksResult | null>>();

async function getPublications(
  permalink: string,
  forceRefresh: boolean,
): Promise<GetPublicationsResponse> {
  // キルスイッチの到達性保証 (alarm が取りこぼされても日次で必ず確認される)。
  // dom-only の早期 return より前に置く — 縮退中こそ「解除」を拾う必要がある
  void refreshRemoteConfigIfStale();

  const settings = await getSettings();
  const { mode, reason } = await resolveMode(settings);
  if (mode === 'dom-only') {
    return { source: 'unavailable', reason: 'dom-only', byUserChoice: reason === 'settings' };
  }

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
      // 一時エラーで有効なキャッシュが残っているなら、表示を壊すより
      // キャッシュを返す (↻ 再取得の失敗でページ全体がエラー化するのを防ぐ)。
      // private はキャッシュ返却しない — 非公開化の意思を上書きするため
      const cached = await cacheGetWithAge<RmCacheValue>(key, TTL.rm);
      if (cached) {
        return {
          source: 'cache',
          fetchedAt: cached.fetchedAt,
          totalItems: cached.value.totalItems,
          papers: cached.value.papers,
        };
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

  // ユーザーが「ページ内データのみ」を選んでいる間は外部データベースへの
  // 照合も行わない (設定文言の遵守)。content script 側でも抑止するが、
  // 全 fetch の単一窓口である background でも防衛する
  const externalAllowed = async (): Promise<boolean> => {
    const { mode, reason } = await resolveMode(await getSettings());
    return !(mode === 'dom-only' && reason === 'settings');
  };

  onMessage('enrichDois', async ({ data }) =>
    (await externalAllowed()) ? enrichDois(data.dois) : {},
  );

  onMessage('resolveTitleDoi', async ({ data }) =>
    (await externalAllowed())
      ? resolveTitleDoi(data.title, data.year, data.firstAuthorFamily)
      : { doi: null, confidence: 0 },
  );

  onMessage('getMode', async () => resolveMode(await getSettings()));

  onMessage('clearCache', async () => ({ clearedEntries: await clearAll() }));

  onMessage('getCacheStats', () => stats());

  onMessage('buildAuthorReport', async ({ data }) => {
    const key = cacheKey('report', data.permalink);
    const cached = await cacheGetWithAge<AuthorWorksResult | null>(key, TTL.report);
    if (cached) return cached.value;

    // 著者推定は ~25 リクエストかかる — 複数タブの同時要求は 1 回に束ねる
    const existing = reportInflight.get(data.permalink);
    if (existing) return existing;

    const promise = (async (): Promise<AuthorWorksResult | null> => {
      try {
        const pubs = await getPublications(data.permalink, false);
        if (pubs.source === 'unavailable') return null;
        const dois = [...new Set(pubs.papers.flatMap((p) => p.dois))];
        if (dois.length === 0) return null;

        const report = await buildAuthorReport(dois);
        // 推定失敗 (null) はキャッシュしない — 一時的な API 不調でも 24h 再試行不能になるため
        if (report !== null) await cacheSet(key, report);
        return report;
      } finally {
        reportInflight.delete(data.permalink);
      }
    })();
    reportInflight.set(data.permalink, promise);
    return promise;
  });

  onMessage('getOtherWorks', async ({ data }) => {
    const { mode } = await resolveMode(await getSettings());
    if (mode === 'dom-only') return null;

    const key = cacheKey('rmOther', data.permalink);
    const cached = await cacheGetWithAge<RmOtherWorks>(key, TTL.rmOther);
    if (cached) return cached.value;

    const existing = otherWorksInflight.get(data.permalink);
    if (existing) return existing;

    const promise = (async (): Promise<RmOtherWorks | null> => {
      try {
        const res = await fetchOtherWorks(data.permalink);
        if (res === null) return null;
        // 部分失敗 (complete=false) はキャッシュしない — 次回開時に再試行し、
        // 「MISC・書籍まで突合済み」の表示が痩せた索引で固定されるのを防ぐ
        if (res.complete) await cacheSet(key, res.works);
        return res.works;
      } catch (err) {
        // 非 JSON 応答 = IP ブロック兆候 → getPublications と同じ 6h 自衛縮退
        if (err instanceof RmApiBrokenError) await tripResearchmapBreaker();
        return null;
      } finally {
        otherWorksInflight.delete(data.permalink);
      }
    })();
    otherWorksInflight.set(data.permalink, promise);
    return promise;
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
