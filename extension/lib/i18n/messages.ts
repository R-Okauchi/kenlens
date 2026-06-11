/**
 * 全 UI 文字列 (i18n シード)。chrome.i18n はブラウザロケール固定で
 * ページ言語 (?lang=en) に追従できないため自前実装。
 *
 * コピー原則 (アンチ評価ガードレール):
 * 禁止語 — 評価 / スコア / ランク / 偏差値 / 優れた / 低い / 不足 / 警告。
 * データの欠如は中立に。「論文自体の問題ではない」を明文化する。
 */

import {
  APP_DESC,
  DATA_CREDITS,
  DISCLAIMER,
  POWERED_BY,
} from '@kenlens/shared/disclaimer';

export type Locale = 'ja' | 'en';

const ja = {
  app_name: '研レンズ',
  app_desc: APP_DESC.ja,

  // --- バッジ ---
  badge_cite_label: '被引用 {n}件',
  badge_cite_tooltip: '被引用数 {n}件 — {source}・{date}時点',
  badge_oa_label: 'OA',
  badge_oa_tooltip: 'オープンアクセス版があります — クリックで本文へ (Unpaywall / OpenAlex)',
  badge_oa_closed_label: '非OA',
  badge_oa_closed_tooltip: 'OA版は見つかりませんでした ({date}時点)',
  badge_doi_label: 'DOI',
  badge_doi_tooltip: 'DOI: {doi} — クリックで本文ページへ',
  badge_doi_hint_label: 'DOI候補',
  badge_doi_hint_tooltip:
    'DOIの候補が見つかりました。researchmapに登録すると、被引用数やOA情報を自動取得できるようになります。',
  badge_approx_label: '参考値',
  badge_approx_tooltip: 'タイトルの類似による照合のため、数値は参考値です。',

  // --- ◎ グリフ / ポップオーバー ---
  glyph_aria: '研レンズ: この論文の外部データ情報',
  glyph_nodata_tooltip: '外部データベースに収録が見つかりませんでした (収録状況によるものです)',
  popover_title: '研レンズ — この論文のデータ',
  popover_match_exact: '✓ DOIで{source}のレコードと一致',
  popover_match_approx: '≈ タイトル類似で照合 (参考値)',
  popover_match_none:
    '一致するレコードが見つかりませんでした。論文自体の問題ではなく、データベースの収録状況によるものです。',
  popover_cite_zero: '被引用: 0件 ({source})',
  popover_cite_unavailable:
    '被引用データ: なし (JaLC系DOIは外部データベースで集計されていません)',
  popover_links: '外部リンク',
  popover_copy_doi: 'DOIをコピー',
  popover_copied: 'コピーしました',
  popover_edit_rm: 'researchmapの業績編集で追加 ↗ (ご本人のログインが必要です)',
  popover_hint_note: '候補はタイトル照合によるものです。確認のうえご利用ください。',
  popover_report: 'データの誤りを報告 ↗',
  popover_error: 'データを取得できませんでした。',
  popover_retry: '再試行',
  popover_asof: '{date}時点',

  // --- サマリーカード ---
  summary_title: '研レンズ サマリー',
  summary_fetched: 'データ取得: {date} 時点',
  summary_refresh: '最新のデータを取得',
  summary_refreshing: '更新中…',
  summary_collapse: '折りたたむ',
  summary_expand: '展開する',
  metric_papers_5y: '直近5年の論文',
  metric_papers_5y_range: '{from}–{to}年',
  metric_papers_src: 'researchmap登録分',
  metric_papers_undated: '日付未登録 {n}件',
  metric_citations: '被引用 (累計)',
  metric_citations_src: '照合済み{matched}/{total}件の合計 (OpenAlex)',
  metric_oa: 'OA論文',
  metric_oa_src: '判定可能 {resolvable}件中',
  metric_doi: 'DOI登録',
  metric_doi_src: '全論文 {total}件中',
  metric_doi_cta: '未登録の{n}件を見る →',
  metric_coauthors: 'よく共著する研究者',
  metric_coauthors_etc: 'ほか',
  metric_nodata: '—',
  summary_empty: '公開業績の登録がありません',
  summary_degraded: '限定モード: 表示中のページから算出しています',
  summary_load_all: '全件を読み込む',

  // --- 整備レポート (v0.3) ---
  report_open: '整備レポートを開く →',
  report_title: '整備レポート',
  report_lead:
    '外部データベースとの突合で、researchmapに未登録の可能性がある論文を探します。候補はあくまで照合結果です — 登録の判断はご本人がお願いします。',
  report_target: '対象プロフィール',
  report_loading: 'researchmapの業績を読み込んでいます…',
  report_unavailable:
    'researchmapのデータを取得できませんでした。設定が「ページ内データのみ」になっている場合は「標準」に戻してください。',
  report_sec_openalex: 'OpenAlexの著者レコードとの突合',
  report_openalex_running: 'OpenAlexで著者を推定しています… (最大1分ほどかかります)',
  report_author_found: '推定された著者: {name} — OpenAlex収録 {works}件 (照合 {votes}/{samples}件で一致)',
  report_author_caution:
    '同名研究者の論文が混ざる可能性があります。チェックを入れる前に必ず内容をご確認ください。',
  report_author_none:
    '著者を推定できませんでした (DOI照合済みの論文が少ないプロフィールでは推定できないことがあります)。下のBibTeX突合をご利用ください。',
  report_sec_bibtex: 'BibTeXファイルとの突合',
  report_bibtex_hint:
    'Google Scholarのプロフィールはご本人なら全業績をBibTeXでエクスポートできます (プロフィール → 記事を選択 → エクスポート)。そのファイルを選ぶか、内容を貼り付けてください。ファイルはブラウザ内でのみ処理されます。',
  report_bibtex_pick: 'BibTeXファイルを選択',
  report_bibtex_paste: 'ここにBibTeXを貼り付け',
  report_bibtex_parsed: '{n}件のエントリを読み込みました',
  report_bibtex_error: 'BibTeXを解析できませんでした。形式をご確認ください。',
  report_missing: 'researchmapに見つからない論文: {n}件 (登録済みと判定: {matched}件)',
  report_no_missing: '差分は見つかりませんでした — researchmapはこのソースと同期できています。',
  report_select_all: 'すべて選択',
  report_select_none: '選択を解除',
  report_download: '選択した{n}件のBibTeXをダウンロード',
  report_import_hint:
    'ダウンロードした .bib は、researchmapの「業績の登録 → インポート」から取り込めます (ご本人のログインが必要です)。',
  report_col_year: '年',
  report_col_title: 'タイトル',
  report_col_venue: '掲載誌',

  // --- 共有カード ---
  share_open: '画像で共有',
  share_dialog_title: '共有カード',
  share_copy: '画像をコピー',
  share_copied: 'コピーしました',
  share_copy_failed: 'コピーできませんでした。「PNGを保存」をお使いください。',
  share_save: 'PNGを保存',
  share_note:
    'ご自身のプロフィールの記録・共有用です。免責文とデータ出典は画像に含まれます。',
  share_close: '閉じる',

  // --- 共通 (免責・クレジットは packages/shared が単一ソース) ---
  disclaimer: DISCLAIMER.ja,
  credit_data: DATA_CREDITS.ja,
  credit_rm: POWERED_BY.label,
  error_api: '外部データベースに接続できませんでした。',
  error_retry: '再試行',
  degraded_metric: '外部データベース未接続のため表示していません',

  // --- Options ---
  options_title: '研レンズ 設定',
  options_section_display: '表示',
  options_language: '言語',
  options_language_auto: '自動 (ページに合わせる)',
  options_summary_card: 'サマリーカードを表示',
  options_section_badges: 'バッジ',
  options_badge_citations: '被引用数',
  options_badge_oa: 'オープンアクセス',
  options_badge_oa_closed: 'クローズドも表示する',
  options_badge_doi: 'DOI リンク',
  options_badge_doi_hint: '整備ヒント (DOI候補)',
  options_section_data: 'データ',
  options_data_mode: '動作モード',
  options_data_mode_auto: '標準 (外部API)',
  options_data_mode_dom: 'ページ内データのみ',
  options_data_mode_desc: '「ページ内データのみ」では外部データベースへの接続を行いません。',
  options_citation_source: '被引用データの取得元',
  options_openalex_key: 'OpenAlex APIキー (任意)',
  options_openalex_key_desc: '設定すると取得が高速になります (バッチ取得)。',
  options_clear_cache: 'キャッシュを消去',
  options_cache_stats: '現在 {bytes}・{days}日間保持',
  options_cleared: '消去しました',
  options_section_about: 'このアプリについて',
  options_version: 'バージョン',
  options_report: '誤りを報告 ↗',

  // --- Welcome ---
  onboard_lead: 'researchmapの業績ページに、被引用数・OA・DOIの情報をその場で表示します。',
  onboard_try: '3ステップで試す',
  onboard_step1: 'researchmapの研究者ページを開く',
  onboard_step1_cta: 'サンプルページを開く ↗',
  onboard_step2: '論文リストの各項目に付くバッジを確認',
  onboard_step3: '好みに合わせて設定で表示を調整',
  onboard_settings_cta: '設定を開く',
  onboard_privacy:
    '閲覧中のresearchmapページの処理に必要な通信以外は行わず、閲覧履歴の収集もありません。',
} as const;

export type Messages = { [K in keyof typeof ja]: string };

const en: Messages = {
  app_name: 'KenLens',
  app_desc: APP_DESC.en,

  badge_cite_label: '{n} citations',
  badge_cite_tooltip: '{n} citations — {source}, as of {date}',
  badge_oa_label: 'OA',
  badge_oa_tooltip: 'Open access version available — click to read (Unpaywall / OpenAlex)',
  badge_oa_closed_label: 'Closed',
  badge_oa_closed_tooltip: 'No OA version found (as of {date})',
  badge_doi_label: 'DOI',
  badge_doi_tooltip: 'DOI: {doi} — click to open',
  badge_doi_hint_label: 'DOI found',
  badge_doi_hint_tooltip:
    'A likely DOI was found. Adding it to researchmap enables automatic citation and OA lookup.',
  badge_approx_label: 'approx.',
  badge_approx_tooltip: 'Matched by title similarity; figures are approximate.',

  glyph_aria: 'KenLens: external data for this publication',
  glyph_nodata_tooltip: 'Not found in external databases (a matter of database coverage)',
  popover_title: 'KenLens — data for this publication',
  popover_match_exact: '✓ Matched via DOI on {source}',
  popover_match_approx: '≈ Matched by title similarity (approximate)',
  popover_match_none:
    'No matching record was found. This reflects database coverage, not the quality of the work.',
  popover_cite_zero: 'Citations: 0 ({source})',
  popover_cite_unavailable:
    'Citation data: not available (JaLC DOIs are not tracked by external databases)',
  popover_links: 'External links',
  popover_copy_doi: 'Copy DOI',
  popover_copied: 'Copied',
  popover_edit_rm: 'Add via researchmap editor ↗ (owner login required)',
  popover_hint_note: 'The candidate comes from title matching. Please verify before use.',
  popover_report: 'Report a data issue ↗',
  popover_error: 'Could not retrieve data.',
  popover_retry: 'Retry',
  popover_asof: 'as of {date}',

  summary_title: 'KenLens Summary',
  summary_fetched: 'Data as of {date}',
  summary_refresh: 'Refresh data',
  summary_refreshing: 'Refreshing…',
  summary_collapse: 'Collapse',
  summary_expand: 'Expand',
  metric_papers_5y: 'Papers, last 5 yrs',
  metric_papers_5y_range: '{from}–{to}',
  metric_papers_src: 'From researchmap',
  metric_papers_undated: '{n} undated',
  metric_citations: 'Citations (total)',
  metric_citations_src: 'Across {matched}/{total} matched works (OpenAlex)',
  metric_oa: 'OA papers',
  metric_oa_src: 'Of {resolvable} resolvable',
  metric_doi: 'With DOI',
  metric_doi_src: 'Of all {total} papers',
  metric_doi_cta: 'View {n} without DOI →',
  metric_coauthors: 'Frequent co-authors',
  metric_coauthors_etc: 'et al.',
  metric_nodata: '—',
  summary_empty: 'No public publications registered',
  summary_degraded: 'Limited mode: computed from the visible page',
  summary_load_all: 'Load all',

  report_open: 'Open maintenance report →',
  report_title: 'Maintenance report',
  report_lead:
    'Finds papers that may be missing from researchmap by cross-checking external databases. Candidates are matching results only — please decide on registration yourself.',
  report_target: 'Target profile',
  report_loading: 'Loading publications from researchmap…',
  report_unavailable:
    'Could not fetch researchmap data. If the mode is set to "Page data only", switch it back to "Standard".',
  report_sec_openalex: 'Cross-check with the OpenAlex author record',
  report_openalex_running: 'Inferring the author on OpenAlex… (may take up to a minute)',
  report_author_found:
    'Inferred author: {name} — {works} works on OpenAlex (matched in {votes}/{samples} samples)',
  report_author_caution:
    'Works by researchers with the same name may be mixed in. Please verify each item before checking it.',
  report_author_none:
    'Could not infer the author (this can happen for profiles with few DOI-matched papers). Try the BibTeX cross-check below.',
  report_sec_bibtex: 'Cross-check with a BibTeX file',
  report_bibtex_hint:
    'On Google Scholar, you can export all your own works as BibTeX (profile → select articles → export). Pick that file or paste its contents. Files are processed entirely inside your browser.',
  report_bibtex_pick: 'Choose BibTeX file',
  report_bibtex_paste: 'Paste BibTeX here',
  report_bibtex_parsed: 'Parsed {n} entries',
  report_bibtex_error: 'Could not parse the BibTeX. Please check the format.',
  report_missing: 'Papers not found on researchmap: {n} (judged already registered: {matched})',
  report_no_missing: 'No gaps found — researchmap is in sync with this source.',
  report_select_all: 'Select all',
  report_select_none: 'Clear selection',
  report_download: 'Download BibTeX for {n} selected',
  report_import_hint:
    'The downloaded .bib can be imported via researchmap "業績の登録 → インポート" (owner login required).',
  report_col_year: 'Year',
  report_col_title: 'Title',
  report_col_venue: 'Venue',

  share_open: 'Share as image',
  share_dialog_title: 'Share card',
  share_copy: 'Copy image',
  share_copied: 'Copied',
  share_copy_failed: 'Could not copy. Please use "Save PNG".',
  share_save: 'Save PNG',
  share_note:
    'For keeping and sharing a record of your own profile. The disclaimer and data credits are part of the image.',
  share_close: 'Close',

  disclaimer: DISCLAIMER.en,
  credit_data: DATA_CREDITS.en,
  credit_rm: POWERED_BY.label,
  error_api: 'Could not reach external databases.',
  error_retry: 'Retry',
  degraded_metric: 'Not shown (external databases not connected)',

  options_title: 'KenLens Settings',
  options_section_display: 'Display',
  options_language: 'Language',
  options_language_auto: 'Auto (follow the page)',
  options_summary_card: 'Show summary card',
  options_section_badges: 'Badges',
  options_badge_citations: 'Citations',
  options_badge_oa: 'Open access',
  options_badge_oa_closed: 'Also show closed access',
  options_badge_doi: 'DOI link',
  options_badge_doi_hint: 'Maintenance hints (DOI candidates)',
  options_section_data: 'Data',
  options_data_mode: 'Mode',
  options_data_mode_auto: 'Standard (external APIs)',
  options_data_mode_dom: 'Page data only',
  options_data_mode_desc: '"Page data only" makes no connections to external databases.',
  options_citation_source: 'Citation data source',
  options_openalex_key: 'OpenAlex API key (optional)',
  options_openalex_key_desc: 'Speeds up retrieval (batch lookups).',
  options_clear_cache: 'Clear cache',
  options_cache_stats: 'Currently {bytes}, kept for {days} days',
  options_cleared: 'Cleared',
  options_section_about: 'About',
  options_version: 'Version',
  options_report: 'Report an issue ↗',

  onboard_lead:
    'Shows citations, OA availability, and DOIs right on researchmap publication pages.',
  onboard_try: 'Try it in 3 steps',
  onboard_step1: 'Open a researcher page on researchmap',
  onboard_step1_cta: 'Open a sample page ↗',
  onboard_step2: 'See the badges on each publication',
  onboard_step3: 'Adjust what is shown in Settings',
  onboard_settings_cta: 'Open Settings',
  onboard_privacy:
    'We only make requests needed for the researchmap page you are viewing. No browsing history is collected.',
};

export const messages: Record<Locale, Messages> = { ja, en };
