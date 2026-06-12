/**
 * 論文 1 件のバッジ行: ◎ (❝ 12) (🔓 OA) (DOI | ✎ DOI候補) (≈ 参考値)
 *
 * 設計判断の核心: 表示されるチップは「正の情報」か「実行可能なヒント」のみ。
 * 被引用 0・OA なし・DOI なし (候補もなし) は非表示 (scite の show-zero=false と同判断)。
 * 人文系・JaLC DOI 論文で「0」が並ぶ画面は事実上のスコアリングになるため。
 */
import { useState, useSyncExternalStore } from 'react';
import { useI18n } from '@/lib/i18n';
import type { Settings } from '@/lib/settings/settings';
import type { DomPublication } from '@/lib/researchmap/types';
import type { ItemStore } from '@/lib/state/item-store';
import { Chip } from '../common/Chip';
import { Skeleton } from '../common/Skeleton';
import { Tooltip } from '../common/Tooltip';
import { Glyph } from './Glyph';

export interface BadgeRowProps {
  permalink: string;
  rmId: string;
  pub: DomPublication;
  store: ItemStore;
  settings: Settings;
  onRetry?: () => void;
}

export function BadgeRow({ permalink, rmId, pub, store, settings, onRetry }: BadgeRowProps) {
  const { t, formatDate } = useI18n();
  const [detailsSignal, setDetailsSignal] = useState(0);
  const state = useSyncExternalStore(
    (cb) => store.subscribe(rmId, cb),
    () => store.get(rmId),
  );

  const enr = state.enrichment;
  const asOf = state.fetchedAt ? formatDate(state.fetchedAt) : '';
  const sourceName = enr?.citationSource === 'crossref' ? 'Crossref' : 'OpenAlex';

  // JaLC/IRDB 由来の低品質レコード (xpac) の被引用 0 は「実ゼロ」ではなく「データなし」
  const citableCount =
    enr?.found && enr.citedByCount !== null && !(enr.isXpac && enr.citedByCount === 0)
      ? enr.citedByCount
      : null;

  const showCite =
    settings.badges.citations && citableCount !== null && citableCount >= 1;
  const showOaOpen = settings.badges.oa && enr?.isOa === true && enr.oaUrl;
  const showOaClosed =
    settings.badges.oa && settings.badges.oaShowClosed && enr?.isOa === false;
  const showDoi = settings.badges.doi && state.doi !== null;
  const showDoiHint =
    settings.badges.doiHint && state.doi === null && state.doiCandidate !== null;
  // タイトル照合経由の数値は常に「参考値」扱い (突合があいまいな場合も同様)
  const showApprox =
    state.matchStatus === 'mismatch-suspected' ||
    (state.doiCandidate !== null && enr?.found === true);

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5" lang={undefined}>
      <Glyph
        permalink={permalink}
        pub={pub}
        state={state}
        onRetry={onRetry}
        openSignal={detailsSignal}
      />

      {state.phase === 'loading' && <Skeleton />}

      {state.phase === 'ready' && (
        <span className="kl-fade-in inline-flex flex-wrap items-center gap-1.5">
          {showCite && (
            <Tooltip
              content={t(
                citableCount === 1 ? 'badge_cite_tooltip_one' : 'badge_cite_tooltip',
                { n: citableCount!, source: sourceName, date: asOf },
              )}
            >
              {/* Crossref 経路 (openAlexUrl なし) は doi.org へフォールバック — クリック不能な
                  リンク風ボタンを作らない */}
              <Chip
                tone="cite"
                ariaLabel={t(
                  citableCount === 1 ? 'badge_cite_label_one' : 'badge_cite_label',
                  { n: citableCount! },
                )}
                href={
                  enr?.openAlexUrl ??
                  (state.doi ?? state.doiCandidate
                    ? `https://doi.org/${state.doi ?? state.doiCandidate}`
                    : undefined)
                }
              >
                <span aria-hidden="true">❝</span> {citableCount}
              </Chip>
            </Tooltip>
          )}

          {showOaOpen && (
            <Tooltip content={t('badge_oa_tooltip')}>
              <Chip tone="oa" href={enr!.oaUrl!}>
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                  <rect x="1.5" y="4.5" width="7" height="4.5" rx="1" fill="currentColor" />
                  <path d="M3 4.5V3a2 2 0 0 1 4 0" fill="none" stroke="currentColor" strokeWidth="1.3" />
                </svg>
                {t('badge_oa_label')}
              </Chip>
            </Tooltip>
          )}

          {showOaClosed && (
            <Tooltip content={t('badge_oa_closed_tooltip', { date: asOf })}>
              <Chip tone="neutral" ariaLabel={t('badge_oa_closed_label')}>
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                  <rect x="1.5" y="4.5" width="7" height="4.5" rx="1" fill="currentColor" />
                  <path d="M3 4.5V3a2 2 0 0 1 4 0V4.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
                </svg>
                {t('badge_oa_closed_label')}
              </Chip>
            </Tooltip>
          )}

          {showDoi && (
            <Tooltip content={t('badge_doi_tooltip', { doi: state.doi! })}>
              <Chip tone="doi" href={`https://doi.org/${state.doi}`}>
                DOI
              </Chip>
            </Tooltip>
          )}

          {showDoiHint && (
            <Tooltip content={t('badge_doi_hint_tooltip')}>
              {/* 候補の詳細 (コピー・編集導線) は ◎ ポップオーバーに集約。
                  openSignal 経由で同じ React ツリー内の Glyph を開く */}
              <Chip tone="hint" onClick={() => setDetailsSignal((s) => s + 1)}>
                ✎ {t('badge_doi_hint_label')}
              </Chip>
            </Tooltip>
          )}

          {showApprox && (
            <Tooltip content={t('badge_approx_tooltip')}>
              <Chip tone="neutral" ariaLabel={t('badge_approx_label')}>
                ≈ {t('badge_approx_label')}
              </Chip>
            </Tooltip>
          )}
        </span>
      )}
    </span>
  );
}
