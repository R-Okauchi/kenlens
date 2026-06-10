/**
 * 行頭の ◎ レンズグリフ + 出典ポップオーバー。
 * グリフは唯一の常設要素 — データ皆無の論文では、これだけが静かに残る
 * (空白でもゼロでも警告でもなく「確認したが外部収録なし」を中立に表す)。
 */
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import type { ItemState } from '@/lib/state/item-store';
import type { DomPublication } from '@/lib/researchmap/types';
import { REPORT_ISSUE_URL, RESEARCHMAP_ORIGIN } from '@/lib/constants';

export interface GlyphContext {
  permalink: string;
  pub: DomPublication;
  state: ItemState;
  onRetry?: () => void;
  /** インクリメントされるたびにポップオーバーを開く (DOI候補チップからの導線) */
  openSignal?: number;
}

function buildReportUrl(ctx: GlyphContext): string {
  const params = new URLSearchParams({
    title: `[data] ${ctx.pub.title.slice(0, 80)}`,
    body: [
      `- researchmap: ${RESEARCHMAP_ORIGIN}/${ctx.permalink}/published_papers/${ctx.pub.rmId ?? ''}`,
      `- DOI: ${ctx.state.doi ?? ctx.state.doiCandidate ?? '(none)'}`,
      `- 内容 (どの表示が違うか):`,
    ].join('\n'),
  });
  return `${REPORT_ISSUE_URL}?${params.toString()}`;
}

export function Glyph(ctx: GlyphContext) {
  const { t, formatDate } = useI18n();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const { state, pub } = ctx;

  useEffect(() => {
    if ((ctx.openSignal ?? 0) > 0) setOpen(true);
  }, [ctx.openSignal]);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    const onDown = (e: Event) => {
      const path = e.composedPath();
      if (
        dialogRef.current &&
        !path.includes(dialogRef.current) &&
        !path.includes(triggerRef.current!)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const enr = state.enrichment;
  const sourceName = enr?.citationSource === 'crossref' ? 'Crossref' : 'OpenAlex';
  const noData = state.phase === 'ready' && (!enr || !enr.found);
  const isError = state.phase === 'error';

  const matchLine = (() => {
    if (isError) return t('popover_error');
    if (state.phase !== 'ready') return null;
    if (enr?.found && state.doi) return t('popover_match_exact', { source: sourceName });
    if (enr?.found && state.doiCandidate) return t('popover_match_approx');
    return t('popover_match_none');
  })();

  const copyDoi = async (doi: string) => {
    await navigator.clipboard.writeText(doi);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <span className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-label={t('glyph_aria')}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={noData ? t('glyph_nodata_tooltip') : undefined}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex h-5 w-5 -my-0.5 items-center justify-center rounded-full border-0 bg-transparent p-0
          cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-focus-ring
          ${isError ? 'opacity-35' : 'opacity-55 hover:opacity-90'}`}
      >
        {/* レンズグリフ (ブランドロゴの 12px 線画版) */}
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <circle cx="5" cy="5" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-ink-faint" />
          <line x1="7.8" y1="7.8" x2="10.6" y2="10.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="text-ink-faint" />
        </svg>
      </button>

      {open && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-label={t('popover_title')}
          tabIndex={-1}
          className="kl-fade-in absolute top-full left-0 z-50 mt-1.5 w-[300px] rounded-md border border-border-default bg-surface p-3 text-md text-ink shadow-popover outline-none"
        >
          <div className="mb-1.5 text-sm font-semibold text-ink">{t('popover_title')}</div>

          {matchLine && <div className="mb-1 text-sm text-ink-soft">{matchLine}</div>}

          {state.phase === 'ready' && enr?.found && (
            <div className="mb-1 text-sm text-ink">
              {/* xpac (JaLC由来) の 0 はガードレール上「実ゼロ」ではなく「データなし」。
                  BadgeRow の citableCount と同じ述語で判定を揃える */}
              {enr.citedByCount !== null && !(enr.isXpac && enr.citedByCount === 0)
                ? enr.citedByCount === 0
                  ? t('popover_cite_zero', { source: sourceName })
                  : t('badge_cite_label', { n: enr.citedByCount })
                : t('popover_cite_unavailable')}
              {enr.isOa !== null && <> / OA: {enr.isOa ? '✓' : '—'}</>}
              {state.fetchedAt && (
                <span className="text-2xs text-ink-soft">
                  {' '}
                  ({t('popover_asof', { date: formatDate(state.fetchedAt) })})
                </span>
              )}
            </div>
          )}

          {isError && ctx.onRetry && (
            <button
              type="button"
              onClick={ctx.onRetry}
              className="mb-1 cursor-pointer rounded-sm border border-border-default bg-surface-sunken px-2 py-0.5 text-sm text-ink hover:bg-[#eceff3]"
            >
              {t('popover_retry')}
            </button>
          )}

          {state.doiCandidate && (
            <div className="mt-1.5 border-t border-border-default pt-1.5">
              <div className="mb-1 text-sm break-all text-ink">
                DOI: <code className="text-sm">{state.doiCandidate}</code>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void copyDoi(state.doiCandidate!)}
                  className="cursor-pointer rounded-sm border border-border-default bg-surface-sunken px-2 py-0.5 text-sm text-ink hover:bg-[#eceff3]"
                >
                  {copied ? t('popover_copied') : t('popover_copy_doi')}
                </button>
                {pub.rmId && (
                  <a
                    className="text-sm text-doi-text underline"
                    href={`${RESEARCHMAP_ORIGIN}/${ctx.permalink}/published_papers/${pub.rmId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t('popover_edit_rm')}
                  </a>
                )}
              </div>
              <div className="mt-1 text-2xs text-ink-soft">{t('popover_hint_note')}</div>
            </div>
          )}

          {(state.externalLinks.length > 0 || enr?.openAlexUrl) && (
            <div className="mt-1.5 border-t border-border-default pt-1.5">
              <div className="mb-1 text-2xs text-ink-soft">{t('popover_links')}</div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                {enr?.openAlexUrl && (
                  <a className="text-sm text-doi-text underline" href={enr.openAlexUrl} target="_blank" rel="noopener noreferrer">
                    OpenAlex ↗
                  </a>
                )}
                {state.externalLinks.map((link) => (
                  <a
                    key={link.url}
                    className="text-sm text-doi-text underline"
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {link.label} ↗
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="mt-1.5 border-t border-border-default pt-1.5 text-2xs text-ink-soft">
            {t('credit_data')}
            {' ｜ '}
            <a
              className="text-2xs text-ink-soft underline"
              href={buildReportUrl(ctx)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('popover_report')}
            </a>
          </div>
        </div>
      )}
    </span>
  );
}
