/**
 * 整備レポート (v0.3) フルページ UI。report.html?permalink=X で開く。
 *
 * アンチ評価ガードレール:
 * - 差分は常に「未登録の可能性のある候補」として提示し、登録判断は本人に委ねる
 *   (チェックボックスはデフォルト全て OFF — 1 件ずつオプトイン)
 * - エラー・データなしは neutral gray の文章のみ。赤・橙・黄は使わない
 * - 件数は必ず分母 (照合済み件数) と出典・取得時点を併記する
 */
import { useEffect, useState, type ChangeEvent } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import { Logo } from '@/components/common/Logo';
import { LocaleContext, useI18n, type Locale } from '@/lib/i18n';
import { sendMessage } from '@/lib/messaging/protocol';
import type { Publication } from '@/lib/researchmap/types';
import type { AuthorWorksResult, ReportCandidate } from '@/lib/report/types';
import { diffAgainstResearchmap, type DiffResult } from '@/lib/report/diff';
import { candidatesFromBibtex, generateBibtex } from '@/lib/report/bibtex';
import { generateRmImportJsonl } from '@/lib/report/rmImport';

/** researchmap permalink の許容文字 (URL パス断片としてそのまま埋め込むため厳格に) */
const PERMALINK_RE = /^[A-Za-z0-9._-]+$/;

function parsePermalink(): string | null {
  const p = new URLSearchParams(location.search).get('permalink');
  return p && PERMALINK_RE.test(p) ? p : null;
}

/* ---- 共通スタイル (options のフォーム規約に合わせる) ---- */

const secondaryButtonClass =
  'kl-dark-input box-border h-8 shrink-0 cursor-pointer rounded-md border border-border-default ' +
  'bg-surface px-3 text-sm font-medium text-ink outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-focus-ring';

const primaryButtonClass =
  'box-border h-9 cursor-pointer rounded-md border-0 bg-brand px-4 text-sm font-semibold ' +
  'text-white outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ' +
  'focus-visible:ring-offset-1 disabled:cursor-default disabled:opacity-40';

/* ---- 候補リスト (Section A / B 共用) ---- */

function download(content: string, mime: string, filename: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadBibtex(selected: ReportCandidate[]) {
  download(generateBibtex(selected), 'application/x-bibtex', 'kenlens-missing.bib');
}

function downloadRmImport(selected: ReportCandidate[]) {
  const { jsonl } = generateRmImportJsonl(selected);
  download(jsonl, 'application/json', 'kenlens-researchmap-import.jsonl');
}

function CandidateList({ diff }: { diff: DiffResult }) {
  const { t } = useI18n();
  // デフォルトは全件未選択 — 本人が内容を確認して 1 件ずつオプトインする
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());

  if (diff.missing.length === 0) {
    return (
      <p aria-live="polite" className="m-0 mt-4 text-md">
        {t('report_no_missing')}
      </p>
    );
  }

  const toggle = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const selectedCandidates = diff.missing.filter((_, i) => selected.has(i));

  return (
    <div className="mt-4">
      <p aria-live="polite" className="m-0 text-md font-medium">
        {t('report_missing', { n: diff.missing.length, matched: diff.matchedCount })}
      </p>

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          className={secondaryButtonClass}
          onClick={() => setSelected(new Set(diff.missing.map((_, i) => i)))}
        >
          {t('report_select_all')}
        </button>
        <button
          type="button"
          className={secondaryButtonClass}
          onClick={() => setSelected(new Set())}
        >
          {t('report_select_none')}
        </button>
      </div>

      <ul className="kl-dark-border m-0 mt-3 list-none rounded-md border border-border-default p-0">
        {diff.missing.map((c, i) => (
          <li
            key={c.doi ?? `t:${c.title}:${i}`}
            className="kl-dark-border border-t border-border-default first:border-t-0"
          >
            {/* label で行全体を包み、行クリック / キーボードどちらでも操作できるようにする */}
            <label className="flex cursor-pointer items-start gap-3 px-3 py-2 focus-within:ring-2 focus-within:ring-inset focus-within:ring-focus-ring">
              <input
                type="checkbox"
                checked={selected.has(i)}
                onChange={() => toggle(i)}
                className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-brand"
              />
              <span className="min-w-0 text-md">
                <span className="kl-dark-soft mr-2 text-sm text-ink-soft">
                  <span className="sr-only">{t('report_col_year')}: </span>
                  {c.year ?? t('metric_nodata')}
                </span>
                <span className="font-medium">
                  <span className="sr-only">{t('report_col_title')}: </span>
                  {c.title}
                </span>
                {c.venue && (
                  <span className="kl-dark-soft block text-sm text-ink-soft">
                    <span className="sr-only">{t('report_col_venue')}: </span>
                    {c.venue}
                  </span>
                )}
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div className="mt-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={primaryButtonClass}
            disabled={selectedCandidates.length === 0}
            onClick={() => downloadRmImport(selectedCandidates)}
          >
            {t('report_download_rm', { n: selectedCandidates.length })}
          </button>
          <button
            type="button"
            className={secondaryButtonClass}
            disabled={selectedCandidates.length === 0}
            onClick={() => downloadBibtex(selectedCandidates)}
          >
            {t('report_download', { n: selectedCandidates.length })}
          </button>
        </div>
        {selectedCandidates.some((c) => c.year === null) && (
          <p className="kl-dark-soft mt-2 mb-0 text-sm text-ink-soft" aria-live="polite">
            {t('report_no_date_note', {
              n: selectedCandidates.filter((c) => c.year === null).length,
            })}
          </p>
        )}
        <p className="kl-dark-soft mt-2 mb-0 text-sm text-ink-soft">
          {t('report_import_hint')}
        </p>
      </div>
    </div>
  );
}

/* ---- Section A: OpenAlex 著者推定との突合 ---- */

type AuthorState =
  | { kind: 'running' }
  | { kind: 'none' } // 推定不能 (null) — 中立に案内し BibTeX 突合へ誘導
  | { kind: 'error' } // 接続失敗 — neutral gray (赤は使わない)
  | { kind: 'done'; result: AuthorWorksResult; diff: DiffResult };

function OpenAlexSection({
  permalink,
  papers,
}: {
  permalink: string;
  papers: Publication[];
}) {
  const { t } = useI18n();
  const [state, setState] = useState<AuthorState>({ kind: 'running' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'running' });
    sendMessage('buildAuthorReport', { permalink }).then(
      (res) => {
        if (cancelled) return;
        if (!res) {
          setState({ kind: 'none' });
          return;
        }
        setState({
          kind: 'done',
          result: res,
          diff: diffAgainstResearchmap(res.candidates, papers),
        });
      },
      () => {
        if (!cancelled) setState({ kind: 'error' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [permalink, papers]);

  return (
    <section className="kl-page-card mt-4 rounded-lg border border-border-default bg-surface p-6 shadow-card">
      <h2 className="m-0 text-lg font-bold">{t('report_sec_openalex')}</h2>

      {state.kind === 'running' && (
        // 最大 1 分かかり得る — スピナーではなく静的な案内文のみ
        <p aria-live="polite" className="kl-dark-soft mt-3 mb-0 text-md text-ink-soft">
          {t('report_openalex_running')}
        </p>
      )}

      {state.kind === 'none' && (
        <p className="kl-dark-soft mt-3 mb-0 text-md text-ink-soft">
          {t('report_author_none')}
        </p>
      )}

      {state.kind === 'error' && (
        <p className="kl-dark-soft mt-3 mb-0 text-md text-ink-soft">{t('error_api')}</p>
      )}

      {state.kind === 'done' && (
        <>
          <p className="mt-3 mb-0 text-md">
            {t('report_author_found', {
              name: state.result.author.displayName,
              works: state.result.author.worksCount,
              votes: state.result.author.votes,
              samples: state.result.author.samples,
            })}
          </p>
          <p className="kl-dark-soft mt-1 mb-0 text-sm text-ink-soft">
            {t('report_author_caution')}
          </p>
          <CandidateList diff={state.diff} />
        </>
      )}
    </section>
  );
}

/* ---- Section B: BibTeX 突合 ---- */

type BibtexState =
  | { kind: 'idle' }
  | { kind: 'error' } // 解析不能 / 0 件 — neutral gray の文章のみ
  | { kind: 'parsed'; count: number; diff: DiffResult; id: number };

let bibtexParseSeq = 0;

function BibtexSection({ papers }: { papers: Publication[] }) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [state, setState] = useState<BibtexState>({ kind: 'idle' });

  // 入力のたびに解析するとタイプ途中で「解析できません」が点滅するため軽くデバウンス
  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed === '') {
      setState({ kind: 'idle' });
      return;
    }
    const timer = setTimeout(() => {
      try {
        const candidates = candidatesFromBibtex(trimmed);
        if (candidates.length === 0) {
          setState({ kind: 'error' });
          return;
        }
        bibtexParseSeq += 1;
        setState({
          kind: 'parsed',
          count: candidates.length,
          diff: diffAgainstResearchmap(candidates, papers),
          id: bibtexParseSeq,
        });
      } catch {
        setState({ kind: 'error' });
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [text, papers]);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 同じファイルの再選択でも change が発火するよう毎回リセット
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setText(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => setState({ kind: 'error' });
    reader.readAsText(file);
  };

  return (
    <section className="kl-page-card mt-4 rounded-lg border border-border-default bg-surface p-6 shadow-card">
      <h2 className="m-0 text-lg font-bold">{t('report_sec_bibtex')}</h2>
      <p className="kl-dark-soft mt-3 mb-0 text-sm text-ink-soft">
        {t('report_bibtex_hint')}
      </p>

      <div className="mt-3">
        {/* sr-only の input を label で包む — 見た目はボタン、フォーカスは input が受ける */}
        <label className="kl-dark-input box-border inline-flex h-8 cursor-pointer items-center rounded-md border border-border-default bg-surface px-3 text-sm font-medium text-ink focus-within:ring-2 focus-within:ring-focus-ring">
          <input type="file" accept=".bib,.txt" onChange={onFile} className="sr-only" />
          {t('report_bibtex_pick')}
        </label>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('report_bibtex_paste')}
        aria-label={t('report_bibtex_paste')}
        rows={6}
        spellCheck={false}
        className="kl-dark-input mt-3 box-border w-full resize-y rounded-md border border-border-default bg-surface p-3 font-mono text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      />

      <p aria-live="polite" className="kl-dark-soft m-0 mt-1 text-sm text-ink-soft">
        {state.kind === 'parsed' && t('report_bibtex_parsed', { n: state.count })}
        {state.kind === 'error' && t('report_bibtex_error')}
      </p>

      {/* key=id で再解析のたびに選択状態をリセット (古い選択の持ち越し防止) */}
      {state.kind === 'parsed' && <CandidateList key={state.id} diff={state.diff} />}
    </section>
  );
}

/* ---- ページ全体 ---- */

type PubState =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'ready'; papers: Publication[]; total: number; fetchedAt: number };

function ReportPage({ permalink }: { permalink: string | null }) {
  const { t, formatDate } = useI18n();
  const [pub, setPub] = useState<PubState>({ kind: 'loading' });

  useEffect(() => {
    if (!permalink) return;
    let cancelled = false;
    sendMessage('getPublications', { permalink }).then(
      (res) => {
        if (cancelled) return;
        if (res.source === 'unavailable') {
          setPub({ kind: 'unavailable' });
        } else {
          setPub({
            kind: 'ready',
            papers: res.papers,
            total: res.totalItems,
            fetchedAt: res.fetchedAt,
          });
        }
      },
      () => {
        if (!cancelled) setPub({ kind: 'unavailable' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [permalink]);

  // permalink 不正/欠落: 中立メッセージのみ (赤系の「エラー」表現はしない)
  if (!permalink) {
    return (
      <main className="mx-auto max-w-[760px] px-6 py-12">
        <div className="kl-page-card rounded-lg border border-border-default bg-surface p-6 shadow-card">
          <p className="kl-dark-soft m-0 text-md text-ink-soft">
            {t('report_unavailable')}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[760px] px-6 py-12">
      {/* ヘッダー */}
      <header className="kl-page-card rounded-lg border border-border-default bg-surface p-6 shadow-card">
        <div className="flex items-center gap-4">
          <Logo size={48} />
          <div className="min-w-0">
            <h1 className="m-0 text-xl font-bold">{t('report_title')}</h1>
            <p className="kl-dark-soft m-0 mt-1 text-sm text-ink-soft">
              {t('report_target')}:{' '}
              <a
                href={`https://researchmap.jp/${permalink}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-sm font-semibold text-brand underline outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                {permalink}
              </a>
            </p>
          </div>
        </div>
        <p className="mt-4 mb-0 text-md">{t('report_lead')}</p>

        {pub.kind === 'loading' && (
          <p aria-live="polite" className="kl-dark-soft mt-3 mb-0 text-sm text-ink-soft">
            {t('report_loading')}
          </p>
        )}
        {pub.kind === 'unavailable' && (
          <p className="kl-dark-soft mt-3 mb-0 text-sm text-ink-soft">
            {t('report_unavailable')}
          </p>
        )}
        {pub.kind === 'ready' && (
          // 出典 (researchmap) と取得時点を必ず併記する (アンチ評価ガードレール)
          <p aria-live="polite" className="kl-dark-soft mt-3 mb-0 text-sm text-ink-soft">
            {t('metric_papers_src')}: {pub.total} —{' '}
            {t('summary_fetched', { date: formatDate(pub.fetchedAt) })}
          </p>
        )}
      </header>

      {/* 突合セクションは researchmap 側のデータが揃ってから */}
      {pub.kind === 'ready' && (
        <>
          <OpenAlexSection permalink={permalink} papers={pub.papers} />
          <BibtexSection papers={pub.papers} />
        </>
      )}

      <footer className="kl-dark-soft mt-6 px-1 text-2xs text-ink-soft">
        <p className="m-0">{t('disclaimer')}</p>
        <p className="m-0 mt-1">
          {t('credit_rm')} ｜ {t('credit_data')}
        </p>
      </footer>
    </main>
  );
}

const locale: Locale = navigator.language.toLowerCase().startsWith('ja') ? 'ja' : 'en';
document.documentElement.lang = locale;

createRoot(document.getElementById('root')!).render(
  <LocaleContext.Provider value={locale}>
    <ReportPage permalink={parsePermalink()} />
  </LocaleContext.Provider>,
);
