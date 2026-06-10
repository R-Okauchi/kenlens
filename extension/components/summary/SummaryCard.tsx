/**
 * プロフィール上部のサマリーカード (v0.2)。
 *
 * アンチ評価の中核ルール:
 * - 数値は全て同一インク色。ゲージ・リング・プログレスバー禁止
 * - 率は分数主表示 (18/24件)、% は従
 * - 全タイルに出典・カバレッジ脚注。分母を隠さない
 * - DOI 未登録は「率を上げろ」ではなく「ここを直せます」の導線にする
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useI18n } from '@/lib/i18n';
import { computeSummary } from '@/lib/metrics/summary';
import type { PageContext } from '@/lib/researchmap/types';
import type { SummaryModel } from '@/lib/state/summary-model';
import { RESEARCHMAP_ORIGIN } from '@/lib/constants';
import { Logo } from '../common/Logo';

interface SummaryCardProps {
  ctx: PageContext;
  model: SummaryModel;
  researcherNames: readonly string[];
  collapsedInitially: boolean;
  onToggleCollapse: (collapsed: boolean) => void;
  onRefresh: () => void;
}

function Tile({
  value,
  label,
  footnote,
  loading,
}: {
  value: string;
  label: string;
  footnote: string | null;
  loading?: boolean;
}) {
  return (
    <div className="min-w-[120px] flex-1 px-3 py-2">
      {loading ? (
        <span className="kl-skeleton mt-1 inline-block h-6 w-[72px]" aria-hidden="true" />
      ) : (
        <div className="text-num leading-tight font-bold text-ink">{value}</div>
      )}
      <div className="mt-0.5 text-sm text-ink-soft">{label}</div>
      {footnote !== null && !loading && (
        <div className="mt-0.5 text-2xs leading-snug text-ink-soft">{footnote}</div>
      )}
    </div>
  );
}

/** DOI 未登録 CTA: 表示中ページの該当行へスクロール (無ければ一覧ページへ) */
function jumpToMissingDoi(ctx: PageContext, missingRmIds: readonly string[]): void {
  for (const rmId of missingRmIds) {
    // 完全一致 (末尾一致) — 部分一致だと rmId '123' が '12345678' の行に当たる
    const link = document.querySelector(
      `a.rm-cv-list-title[href$="/published_papers/${rmId}"]`,
    );
    const li = link?.closest('li');
    if (li instanceof HTMLElement) {
      li.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const original = li.style.backgroundColor;
      li.style.transition = 'background-color 1.2s ease-out';
      li.style.backgroundColor = '#e6f4f2';
      setTimeout(() => {
        li.style.backgroundColor = original;
      }, 1200);
      return;
    }
  }
  window.location.href = `${RESEARCHMAP_ORIGIN}/${ctx.permalink}/published_papers`;
}

export function SummaryCard({
  ctx,
  model,
  researcherNames,
  collapsedInitially,
  onToggleCollapse,
  onRefresh,
}: SummaryCardProps) {
  const { t, locale, formatDate } = useI18n();
  const state = useSyncExternalStore(
    (cb) => model.subscribe(cb),
    () => model.get(),
  );
  const [collapsed, setCollapsed] = useState(collapsedInitially);

  useEffect(() => {
    onToggleCollapse(collapsed);
  }, [collapsed, onToggleCollapse]);

  const metrics = useMemo(
    () =>
      state.papers
        ? computeSummary(state.papers, state.enrichments, { locale, researcherNames })
        : null,
    [state.papers, state.enrichments, locale, researcherNames],
  );

  // 業績ゼロのプロフィールには何も出さない (沈黙が最も中立)
  if (state.phase === 'ready' && state.totalItems === 0) return null;

  const header = (
    <div className="flex items-center gap-2 px-4 py-2.5">
      <Logo size={20} />
      <span className="text-md font-bold text-ink">{t('summary_title')}</span>
      <span className="ml-auto flex items-center gap-3">
        {state.fetchedAt !== null && !collapsed && (
          <span className="text-2xs text-ink-soft">
            {t('summary_fetched', { date: formatDate(state.fetchedAt) })}
          </span>
        )}
        {!collapsed && state.phase === 'ready' && (
          <button
            type="button"
            aria-label={t('summary_refresh')}
            title={t('summary_refresh')}
            disabled={state.refreshing}
            onClick={onRefresh}
            className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent text-ink-soft outline-none hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-default"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 16 16"
              aria-hidden="true"
              className={state.refreshing ? 'kl-spin' : undefined}
            >
              <path
                d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 1.5v3h-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
        <button
          type="button"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((v) => !v)}
          className="inline-flex cursor-pointer items-center gap-1 rounded-sm border-0 bg-transparent px-1 py-0.5 text-sm text-ink-soft outline-none hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          {collapsed ? `▼ ${t('summary_expand')}` : `▲ ${t('summary_collapse')}`}
        </button>
      </span>
    </div>
  );

  return (
    <section
      aria-label={t('summary_title')}
      className="mb-4 overflow-hidden rounded-lg border border-border-default bg-surface shadow-card"
    >
      <div className="h-0.5 w-full" style={{ background: 'linear-gradient(135deg, #0D9488, #0EA5E9)' }} />
      {header}

      {!collapsed && (
        <div className="border-t border-border-default">
          {state.phase === 'unavailable' && (
            <p className="m-0 px-4 py-3 text-md text-ink-soft">
              {state.unavailableReason === 'dom-only'
                ? t('summary_degraded')
                : t('error_api')}
            </p>
          )}

          {state.phase !== 'unavailable' && (
            <>
              <div className="flex flex-wrap divide-x divide-border-default py-1.5">
                <Tile
                  loading={metrics === null}
                  value={metrics ? String(metrics.papers5y) : ''}
                  label={`${t('metric_papers_5y')} (${metrics ? t('metric_papers_5y_range', { from: metrics.range.from, to: metrics.range.to }) : ''})`}
                  footnote={
                    metrics
                      ? metrics.undatedCount > 0
                        ? `${t('metric_papers_src')}・${t('metric_papers_undated', { n: metrics.undatedCount })}`
                        : t('metric_papers_src')
                      : null
                  }
                />
                <Tile
                  loading={metrics === null || !state.enrichComplete}
                  value={metrics ? metrics.citations.total.toLocaleString() : ''}
                  label={t('metric_citations')}
                  footnote={
                    metrics
                      ? t('metric_citations_src', {
                          matched: metrics.citations.matched,
                          total: metrics.totalPapers,
                        })
                      : null
                  }
                />
                <Tile
                  loading={metrics === null || !state.enrichComplete}
                  value={
                    metrics
                      ? metrics.oa.resolvable > 0
                        ? `${metrics.oa.count} / ${metrics.oa.resolvable}`
                        : t('metric_nodata')
                      : ''
                  }
                  label={
                    metrics && metrics.oa.resolvable > 0
                      ? `${t('metric_oa')} (${Math.round((metrics.oa.count / metrics.oa.resolvable) * 100)}%)`
                      : t('metric_oa')
                  }
                  footnote={
                    metrics
                      ? metrics.oa.resolvable > 0
                        ? t('metric_oa_src', { resolvable: metrics.oa.resolvable })
                        : t('degraded_metric')
                      : null
                  }
                />
                <Tile
                  loading={metrics === null}
                  value={metrics ? `${metrics.doi.count} / ${metrics.doi.total}` : ''}
                  label={
                    metrics && metrics.doi.total > 0
                      ? `${t('metric_doi')} (${Math.round((metrics.doi.count / metrics.doi.total) * 100)}%)`
                      : t('metric_doi')
                  }
                  footnote={null}
                />
              </div>

              {metrics && metrics.doi.missingRmIds.length > 0 && (
                <div className="px-4 pb-1.5">
                  <button
                    type="button"
                    onClick={() => jumpToMissingDoi(ctx, metrics.doi.missingRmIds)}
                    className="cursor-pointer border-0 bg-transparent p-0 text-sm text-brand underline outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                  >
                    {t('metric_doi_cta', { n: metrics.doi.missingRmIds.length })}
                  </button>
                </div>
              )}

              {metrics && metrics.coauthors.length > 0 && (
                <div className="border-t border-border-default px-4 py-2 text-sm text-ink">
                  <span className="text-ink-soft">{t('metric_coauthors')}: </span>
                  {metrics.coauthors.map((c, i) => (
                    <span key={c.name}>
                      {i > 0 && ' ・ '}
                      <a
                        className="text-doi-text underline"
                        href={`${RESEARCHMAP_ORIGIN}/researchers?q=${encodeURIComponent(c.name)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {c.name}
                      </a>
                    </span>
                  ))}
                  <span className="text-ink-soft"> {t('metric_coauthors_etc')}</span>
                </div>
              )}
            </>
          )}

          <div className="border-t border-border-default bg-surface-sunken px-4 py-2 text-2xs leading-relaxed text-ink-soft">
            {t('disclaimer')}
            <br />
            <a
              className="text-2xs text-ink-soft underline"
              href={RESEARCHMAP_ORIGIN}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('credit_rm')}
            </a>
            {' ｜ '}
            {t('credit_data')}
          </div>
        </div>
      )}
    </section>
  );
}
