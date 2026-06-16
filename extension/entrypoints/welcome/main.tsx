import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import './style.css';
import { Logo } from '@/components/common/Logo';
import { LocaleContext, useI18n, type Locale } from '@/lib/i18n';
import { REPO_URL, SAMPLE_PROFILE_URL, SPONSOR_URL } from '@/lib/constants';

function Welcome() {
  const { t } = useI18n();
  const steps: [string, string | null][] = [
    [t('onboard_step1'), SAMPLE_PROFILE_URL],
    [t('onboard_step2'), null],
    [t('onboard_step3'), null],
  ];

  return (
    <main className="mx-auto flex min-h-screen max-w-[560px] flex-col justify-center px-6 py-12">
      <div className="kl-page-card rounded-lg border border-border-default bg-surface p-8 shadow-card">
        <div className="flex items-center gap-4">
          <Logo size={56} />
          <div>
            <h1 className="m-0 text-xl font-bold">{t('app_name')}</h1>
            <p className="kl-dark-soft m-0 mt-1 text-sm text-ink-soft">KenLens for researchmap</p>
          </div>
        </div>

        <p className="mt-5 mb-0 text-md">{t('onboard_lead')}</p>

        <p className="mt-3 mb-0">
          <span className="inline-block rounded-full bg-brand-soft px-3 py-1 text-sm font-medium text-brand-strong">
            {t('disclaimer')}
          </span>
        </p>

        <h2 className="mt-7 mb-3 text-lg font-bold">{t('onboard_try')}</h2>
        <ol className="m-0 list-none space-y-3 p-0">
          {steps.map(([label, href], i) => (
            <li key={label} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
                {i + 1}
              </span>
              <span className="text-md">
                {label}
                {href && (
                  <>
                    {' '}
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-brand underline"
                    >
                      {t('onboard_step1_cta')}
                    </a>
                  </>
                )}
                {i === 2 && (
                  <>
                    {' '}
                    <button
                      type="button"
                      onClick={() => void browser.runtime.openOptionsPage()}
                      className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-brand underline"
                    >
                      {t('onboard_settings_cta')}
                    </button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ol>

        {/* 無料・OSS への控えめな応援導線。金銭を前面に出さず、使い方の後に 1 行だけ。
            ❤ は UI 赤禁止のため絵文字を使わず currentColor=teal の SVG で描く */}
        <p className="mt-7 mb-0 border-t border-border-default pt-5 text-sm text-ink-soft">
          {t('support_intro')}{' '}
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-brand underline"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path
                d="M6 1.2l1.4 2.95 3.25.46-2.35 2.27.56 3.22L6 8.58 3.14 10.1l.56-3.22L1.35 4.61l3.25-.46z"
                fill="currentColor"
              />
            </svg>
            {t('support_star')}
          </a>
          {' · '}
          <a
            href={SPONSOR_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-brand underline"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path
                d="M6 10.4S1.3 7.6 1.3 4.3a2.4 2.4 0 0 1 4.7-.7 2.4 2.4 0 0 1 4.7.7C10.7 7.6 6 10.4 6 10.4z"
                fill="currentColor"
              />
            </svg>
            {t('support_sponsor')}
          </a>
        </p>

        <p className="kl-dark-soft mt-5 mb-0 text-sm text-ink-soft">🔒 {t('onboard_privacy')}</p>
        <p className="kl-dark-soft mt-2 mb-0 text-2xs text-ink-soft">
          {t('credit_rm')}{t('sep_credit')}{t('credit_data')}
        </p>
      </div>
    </main>
  );
}

const locale: Locale = navigator.language.toLowerCase().startsWith('ja') ? 'ja' : 'en';
document.documentElement.lang = locale;

createRoot(document.getElementById('root')!).render(
  <LocaleContext.Provider value={locale}>
    <Welcome />
  </LocaleContext.Provider>,
);
