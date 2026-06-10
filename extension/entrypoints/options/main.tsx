import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import './style.css';
import { Logo } from '@/components/common/Logo';
import { LocaleContext, useI18n, type Locale } from '@/lib/i18n';
import { REPORT_ISSUE_URL } from '@/lib/constants';
import { sendMessage } from '@/lib/messaging/protocol';
import {
  getOpenAlexApiKey,
  getSettings,
  setOpenAlexApiKey,
  setSettings,
  watchSettings,
  type Settings,
} from '@/lib/settings/settings';

const CACHE_RETENTION_DAYS = 7;

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n <= 0) return '0 KB';
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

const fieldClass =
  'kl-dark-input box-border h-8 rounded-md border border-border-default bg-surface px-2 ' +
  'text-md text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus-ring';

const buttonClass =
  'kl-dark-input box-border h-8 shrink-0 cursor-pointer rounded-md border border-border-default ' +
  'bg-surface px-3 text-sm font-medium text-ink outline-none hover:bg-surface-sunken ' +
  'focus-visible:ring-2 focus-visible:ring-focus-ring';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="kl-page-card rounded-lg border border-border-default bg-surface p-6 shadow-card">
      <h2 className="m-0 mb-4 text-md font-bold">{title}</h2>
      {children}
    </section>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
  disabled = false,
  indent = false,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  indent?: boolean;
}) {
  const id = useId();
  return (
    <div className={`flex items-center justify-between gap-4${indent ? ' pl-5' : ''}`}>
      <span id={id} className={`text-md${disabled ? ' text-ink-faint' : ''}`}>
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={
          'relative box-border inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full ' +
          'border-0 p-0 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus-ring ' +
          'focus-visible:ring-offset-1 disabled:cursor-default disabled:opacity-40 ' +
          (checked ? 'bg-brand' : 'bg-ink-faint')
        }
      >
        <span
          className={
            'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-card transition-transform ' +
            (checked ? 'translate-x-[22px]' : 'translate-x-0.5')
          }
        />
      </button>
    </div>
  );
}

function OptionsPage({
  settings,
  update,
}: {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}) {
  const { t } = useI18n();
  const languageId = useId();
  const modeId = useId();
  const keyId = useId();

  const [apiKey, setApiKey] = useState('');
  const [stats, setStats] = useState<{ entries: number; approxBytes: number } | null>(null);
  const [cleared, setCleared] = useState(false);
  const keySaveTimer = useRef<number | null>(null);

  useEffect(() => {
    void getOpenAlexApiKey().then((key) => setApiKey(key ?? ''));
  }, []);

  const refreshStats = useCallback(async () => {
    try {
      setStats(await sendMessage('getCacheStats', undefined));
    } catch {
      setStats(null);
    }
  }, []);

  useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

  const clearCache = useCallback(async () => {
    try {
      await sendMessage('clearCache', undefined);
    } catch {
      return;
    }
    await refreshStats();
    setCleared(true);
    window.setTimeout(() => setCleared(false), 2000);
  }, [refreshStats]);

  const badges = settings.badges;
  const setBadges = (patch: Partial<Settings['badges']>) =>
    update({ badges: { ...badges, ...patch } });

  return (
    <main className="mx-auto flex max-w-[560px] flex-col gap-4 px-6 py-10">
      <header className="flex items-center gap-3 px-1">
        <Logo size={40} />
        <h1 className="m-0 text-xl font-bold">{t('options_title')}</h1>
      </header>

      <Section title={t('options_section_display')}>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <label htmlFor={languageId} className="text-md">
              {t('options_language')}
            </label>
            <select
              id={languageId}
              value={settings.language}
              onChange={(e) => update({ language: e.target.value as Settings['language'] })}
              className={`${fieldClass} cursor-pointer`}
            >
              <option value="auto">{t('options_language_auto')}</option>
              <option value="ja">日本語</option>
              <option value="en">English</option>
            </select>
          </div>
          <ToggleRow
            label={t('options_summary_card')}
            checked={settings.summaryCard}
            onChange={(v) => update({ summaryCard: v })}
          />
        </div>
      </Section>

      <Section title={t('options_section_badges')}>
        <div className="space-y-3">
          <ToggleRow
            label={t('options_badge_citations')}
            checked={badges.citations}
            onChange={(v) => setBadges({ citations: v })}
          />
          <ToggleRow
            label={t('options_badge_oa')}
            checked={badges.oa}
            onChange={(v) => setBadges({ oa: v })}
          />
          <ToggleRow
            label={t('options_badge_oa_closed')}
            checked={badges.oaShowClosed}
            onChange={(v) => setBadges({ oaShowClosed: v })}
            disabled={!badges.oa}
            indent
          />
          <ToggleRow
            label={t('options_badge_doi')}
            checked={badges.doi}
            onChange={(v) => setBadges({ doi: v })}
          />
          <ToggleRow
            label={t('options_badge_doi_hint')}
            checked={badges.doiHint}
            onChange={(v) => setBadges({ doiHint: v })}
          />
        </div>
      </Section>

      <Section title={t('options_section_data')}>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between gap-4">
              <label htmlFor={modeId} className="text-md">
                {t('options_data_mode')}
              </label>
              <select
                id={modeId}
                value={settings.dataMode === 'dom-only' ? 'dom-only' : 'auto'}
                onChange={(e) => {
                  const next = e.target.value as Settings['dataMode'];
                  // 'api' (キルスイッチ無視の固定モード、UI 非公開) を表示用の 'auto' への
                  // 見かけ上の変更で上書きしない
                  const displayed = settings.dataMode === 'dom-only' ? 'dom-only' : 'auto';
                  if (next !== displayed) update({ dataMode: next });
                }}
                className={`${fieldClass} cursor-pointer`}
              >
                <option value="auto">{t('options_data_mode_auto')}</option>
                <option value="dom-only">{t('options_data_mode_dom')}</option>
              </select>
            </div>
            <p className="kl-dark-soft mt-1 mb-0 text-sm text-ink-soft">
              {t('options_data_mode_desc')}
            </p>
          </div>

          <div className="flex items-center justify-between gap-4">
            <span className="text-md">{t('options_citation_source')}</span>
            <span className="kl-dark-soft text-md text-ink-soft">OpenAlex</span>
          </div>

          <div>
            <label htmlFor={keyId} className="text-md">
              {t('options_openalex_key')}
            </label>
            <input
              id={keyId}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={apiKey}
              onChange={(e) => {
                // blur 前にタブを閉じても失われないよう、入力中もデバウンス保存する
                const value = e.target.value;
                setApiKey(value);
                if (keySaveTimer.current) window.clearTimeout(keySaveTimer.current);
                keySaveTimer.current = window.setTimeout(
                  () => void setOpenAlexApiKey(value),
                  400,
                );
              }}
              onBlur={() => {
                if (keySaveTimer.current) window.clearTimeout(keySaveTimer.current);
                void setOpenAlexApiKey(apiKey);
              }}
              className={`${fieldClass} mt-1 w-full`}
            />
            <p className="kl-dark-soft mt-1 mb-0 text-sm text-ink-soft">
              {t('options_openalex_key_desc')}
            </p>
          </div>

          <div className="flex items-center justify-between gap-4">
            <span aria-live="polite" className="text-sm">
              {cleared ? (
                <span className="font-medium text-brand">{t('options_cleared')}</span>
              ) : (
                <span className="kl-dark-soft text-ink-soft">
                  {t('options_cache_stats', {
                    bytes: stats ? formatBytes(stats.approxBytes) : '—',
                    days: CACHE_RETENTION_DAYS,
                  })}
                </span>
              )}
            </span>
            <button type="button" onClick={() => void clearCache()} className={buttonClass}>
              {t('options_clear_cache')}
            </button>
          </div>
        </div>
      </Section>

      <Section title={t('options_section_about')}>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <span className="text-md">{t('options_version')}</span>
            <span className="kl-dark-soft text-md text-ink-soft">
              {browser.runtime.getManifest().version}
            </span>
          </div>
          <p className="m-0">
            <a
              href={REPORT_ISSUE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-sm text-md font-semibold text-brand underline outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              {t('options_report')}
            </a>
          </p>
          <p className="kl-dark-soft m-0 text-2xs text-ink-soft">
            {t('credit_rm')} ｜ {t('credit_data')}
          </p>
          <p className="m-0">
            <span className="inline-block rounded-full bg-brand-soft px-3 py-1 text-sm font-medium text-brand-strong">
              {t('disclaimer')}
            </span>
          </p>
        </div>
      </Section>
    </main>
  );
}

const browserLocale: Locale = navigator.language.toLowerCase().startsWith('ja') ? 'ja' : 'en';

function App() {
  const [settings, setSettingsState] = useState<Settings | null>(null);

  useEffect(() => {
    void getSettings().then(setSettingsState);
    return watchSettings(setSettingsState);
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    // 楽観更新 (watchSettings の反映で最終的に整合する)
    setSettingsState((prev) =>
      prev
        ? { ...prev, ...patch, badges: { ...prev.badges, ...(patch.badges ?? {}) } }
        : prev,
    );
    void setSettings(patch);
  }, []);

  const locale: Locale =
    settings && settings.language !== 'auto' ? settings.language : browserLocale;

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  if (!settings) return null;

  return (
    <LocaleContext.Provider value={locale}>
      <OptionsPage settings={settings} update={update} />
    </LocaleContext.Provider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
