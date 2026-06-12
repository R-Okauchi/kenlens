/**
 * researchmap コンテンツスクリプト。
 * - matches は researchmap.jp のみ (権限最小)
 * - 判定不能ページ (403/予約ルート) には何も注入しない
 * - ホスト要素には同期的に min-height を与え、非同期描画でレイアウトシフトを起こさない
 */
import '@/entrypoints/researchmap.content/style.css';
import { createShadowRootUi, defineContentScript } from '#imports';
import { browser } from 'wxt/browser';
import { createRoot } from 'react-dom/client';
import { BadgeRow } from '@/components/badges/BadgeRow';
import { SummaryCard } from '@/components/summary/SummaryCard';
import { PageController } from '@/lib/controller/page-controller';
import { LocaleContext, detectPageLocale, resolveLocale, type Locale } from '@/lib/i18n';
import { detectPage } from '@/lib/page/detect';
import { watchListItems } from '@/lib/page/anchors';
import { parseResearcherNames, type ParsedListItem } from '@/lib/page/dom-parser';
import { ItemStore } from '@/lib/state/item-store';
import { SummaryModel } from '@/lib/state/summary-model';
import { getSettings, watchSettings, type Settings } from '@/lib/settings/settings';
import type { PageContext } from '@/lib/researchmap/types';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';

const COLLAPSED_KEY = 'kl:summary-collapsed';

interface MountedRow {
  host: HTMLElement;
  container: HTMLElement;
  remove: () => void;
  render: (s: Settings) => void;
}

export default defineContentScript({
  matches: ['https://researchmap.jp/*'],
  // researchmap は完全 SSR — 既定の document_idle (load 後) を待つ必要がなく、
  // DOMContentLoaded 直後に開始して初回表示を前倒しする
  runAt: 'document_end',
  cssInjectionMode: 'ui',

  async main(ctx) {
    const page = detectPage(window.location, document);
    if (!page) return;

    // 後からマウントされる行にも常に最新の設定を渡す (watchSettings で更新)
    let currentSettings = await getSettings();
    let currentLocale = resolveLocale(currentSettings.language, detectPageLocale(document));
    const store = new ItemStore();
    const summaryModel = new SummaryModel();
    const controller = new PageController(page, store, summaryModel);
    // researchmap 取得はカード/バッジのマウント (CSS 取得込み) を待たずに開始する
    controller.prefetch();

    const mountedRows = new Map<string, MountedRow>();
    let summaryUi: { remove: () => void } | null = null;
    let summaryMounting = false;

    const mountBadgeRow = async (item: ParsedListItem) => {
      const rmId = item.pub.rmId!;
      // AngularJS の再描画で li が作り直されると WeakSet 上は新規 item になる。
      // 生きている行があれば二重マウントせず、死んだ行は掃除してから付け直す
      const existing = mountedRows.get(rmId);
      if (existing) {
        if (existing.host.isConnected) return;
        existing.remove();
        mountedRows.delete(rmId);
      }

      const ui = await createShadowRootUi(ctx, {
        name: 'kenlens-badges',
        position: 'inline',
        anchor: item.li,
        append: 'last',
        onMount(container, _shadow, shadowHost) {
          // CLS ゼロ: 描画前に高さを確保する
          shadowHost.style.display = 'block';
          shadowHost.style.minHeight = '26px';
          shadowHost.style.marginTop = '4px';
          container.setAttribute('lang', currentLocale);
          const root = createRoot(container);
          const render = (s: Settings) =>
            root.render(
              <LocaleContext.Provider value={currentLocale}>
                <BadgeRow
                  permalink={page.permalink}
                  rmId={rmId}
                  pub={item.pub}
                  store={store}
                  settings={s}
                  onRetry={() => controller.retry(rmId)}
                />
              </LocaleContext.Provider>,
            );
          render(currentSettings);
          mountedRows.set(rmId, {
            host: shadowHost,
            container,
            remove: () => ui.remove(),
            render,
          });
          return root;
        },
        onRemove(root) {
          root?.unmount();
        },
      });
      // CSS 取得の await 中に li が消えていたら付けない (見えないルートのリーク防止)
      if (!item.li.isConnected) return;
      ui.mount();
    };

    const mountSummaryIfNeeded = async () => {
      if (summaryUi || summaryMounting || !currentSettings.summaryCard) return;
      summaryMounting = true;
      let remount = false;
      try {
        const mountedLocale = currentLocale;
        const ui = await mountSummaryCard(ctx, page, mountedLocale, summaryModel, controller);
        if (!currentSettings.summaryCard) {
          ui?.remove();
        } else if (mountedLocale !== currentLocale) {
          ui?.remove();
          remount = true;
        } else {
          summaryUi = ui;
        }
      } finally {
        summaryMounting = false;
      }
      if (remount) void mountSummaryIfNeeded();
    };

    const stopSettingsWatch = watchSettings((next) => {
      const nextLocale = resolveLocale(next.language, detectPageLocale(document));
      const localeChanged = nextLocale !== currentLocale;
      currentSettings = next;
      if (localeChanged) {
        currentLocale = nextLocale;
        for (const row of mountedRows.values()) {
          row.container.setAttribute('lang', currentLocale);
          row.render(next);
        }
        summaryUi?.remove();
        summaryUi = null;
        void mountSummaryIfNeeded();
        return;
      }

      for (const row of mountedRows.values()) row.render(next);
      // サマリーカードの表示設定はマウント/アンマウントで追従する
      if (!next.summaryCard && summaryUi) {
        summaryUi.remove();
        summaryUi = null;
      } else if (next.summaryCard && !summaryUi) {
        void mountSummaryIfNeeded();
      }
    });

    await mountSummaryIfNeeded();

    const stopWatching = watchListItems(document, (items) => {
      for (const [rmId, row] of mountedRows) {
        if (!row.host.isConnected) {
          row.remove();
          mountedRows.delete(rmId);
        }
      }

      const targets = items.filter(
        (i) => i.listType === 'published_papers' && i.pub.rmId !== null,
      );
      if (targets.length === 0) return;
      controller.register(targets);
      for (const item of targets) void mountBadgeRow(item);
    });

    ctx.onInvalidated(() => {
      stopWatching();
      stopSettingsWatch();
    });
  },
});

async function mountSummaryCard(
  ctx: ContentScriptContext,
  page: PageContext,
  locale: Locale,
  model: SummaryModel,
  controller: PageController,
): Promise<{ remove: () => void } | null> {
  // 最初の CV パネルの直前に挿入 (一覧ページでは published_papers パネルの直前)
  const heading =
    page.pageType === 'list'
      ? document.querySelector('#published_papers')
      : document.querySelector('.rm-cv-panel-heading');
  const anchor = heading?.closest('.panel') ?? heading?.parentElement ?? null;
  if (!anchor) return null;

  const researcherNames = parseResearcherNames(document);
  const collapsedInitially =
    ((await browser.storage.local.get(COLLAPSED_KEY))[COLLAPSED_KEY] ?? false) === true;

  const ui = await createShadowRootUi(ctx, {
    name: 'kenlens-summary',
    position: 'inline',
    anchor,
    append: 'before',
    onMount(container, _shadow, shadowHost) {
      shadowHost.style.display = 'block';
      // 初期から最終高さ相当を確保し、データ到着でのシフトを防ぐ
      shadowHost.style.minHeight = collapsedInitially ? '48px' : '190px';
      container.setAttribute('lang', locale);

      // カードが「沈黙」する状態 (業績ゼロ) では確保した高さも返す —
      // 透明な 190px の空隙は沈黙ではなく異物になるため
      const syncHostToState = () => {
        const state = model.get();
        if (state.phase === 'ready' && state.totalItems === 0) {
          shadowHost.style.display = 'none';
          shadowHost.style.minHeight = '0';
        } else if (state.phase === 'unavailable') {
          shadowHost.style.minHeight = '0';
        }
      };
      const unsubscribe = model.subscribe(syncHostToState);
      syncHostToState();

      const root = createRoot(container);
      root.render(
        <LocaleContext.Provider value={locale}>
          <SummaryCard
            ctx={page}
            model={model}
            researcherNames={researcherNames}
            collapsedInitially={collapsedInitially}
            onToggleCollapse={(collapsed) => {
              shadowHost.style.minHeight = collapsed ? '48px' : '190px';
              void browser.storage.local.set({ [COLLAPSED_KEY]: collapsed });
            }}
            onRefresh={() => void controller.refreshAll()}
          />
        </LocaleContext.Provider>,
      );
      return { root, unsubscribe };
    },
    onRemove(mounted) {
      mounted?.unsubscribe();
      mounted?.root.unmount();
    },
  });
  ui.mount();
  controller.activateSummary();
  return { remove: () => ui.remove() };
}
