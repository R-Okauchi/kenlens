/**
 * E2E: 実拡張入り Chromium で実ページに対する受け入れチェックを自動実行する。
 *
 *   pnpm -F @kenlens/extension build && node e2e/run.mjs
 *
 * - launchPersistentContext + --load-extension (MV3 拡張テストの正攻法)
 * - 実 researchmap / 実 API を叩く (CI では実行しない。拡張自身が 1req/s に自己制限する)
 * - スクショは e2e/shots/ に保存 (実在研究者データを含むため gitignore 済み)
 */
import { mkdtempSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXT = join(ROOT, '.output', 'chrome-mv3');
const SHOTS = join(ROOT, 'e2e', 'shots');
// 対象プロフィールは env で変更できる
const STEM = process.env.KENLENS_E2E_STEM ?? 'p_chun';
const HUM = process.env.KENLENS_E2E_HUM ?? 'p_chun';
const HEADED = process.env.KENLENS_E2E_HEADED === '1';

if (!existsSync(join(EXT, 'manifest.json'))) {
  console.error(`built extension not found: ${EXT} — run \`pnpm build\` first`);
  process.exit(1);
}
mkdirSync(SHOTS, { recursive: true });

/** 結果コレクタ */
const results = [];
function check(name, cond, detail = '') {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${detail && !cond ? ` — ${detail}` : ''}`);
}
const step = (title) => console.log(`\n== ${title}`);

/** shadow DOM 内の禁止色 (赤/橙/黄系) スキャン */
async function scanForbiddenColors(page) {
  return page.evaluate(() => {
    const offenders = [];
    const isForbidden = (value) => {
      const m = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (!m) return false;
      const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
      const a = m[4] === undefined ? 1 : Number(m[4]);
      if (a < 0.05) return false;
      const redish = r > 150 && r - g > 70 && r - b > 70;
      const orangeYellow = r > 180 && g > 120 && b < 90;
      return redish || orangeYellow;
    };
    for (const host of document.querySelectorAll('kenlens-badges, kenlens-summary')) {
      const root = host.shadowRoot;
      if (!root) continue;
      for (const el of root.querySelectorAll('*')) {
        const cs = getComputedStyle(el);
        for (const prop of ['color', 'backgroundColor', 'borderTopColor', 'outlineColor']) {
          if (isForbidden(cs[prop])) {
            offenders.push(`${el.tagName}.${el.className} ${prop}=${cs[prop]}`);
          }
        }
      }
    }
    return offenders.slice(0, 5);
  });
}

// innerText は shadow DOM の中身を含まないため、shadowRoot.textContent を読む
const shadowText = (locator) =>
  locator.evaluate((el) => el.shadowRoot?.textContent ?? '');
const badgeTextList = (page) =>
  page
    .locator('kenlens-badges')
    .evaluateAll((els) => els.map((e) => e.shadowRoot?.textContent ?? ''));

// チップ単位のテキスト一覧 (textContent の連結では \b が効かないため構造で判定する)
const chipList = (page) =>
  page
    .locator('kenlens-badges')
    .evaluateAll((els) =>
      els.flatMap((e) =>
        [...(e.shadowRoot?.querySelectorAll('a, button') ?? [])].map((c) =>
          (c.textContent ?? '').trim(),
        ),
      ),
    );
const citeCounts = (chips) =>
  chips
    .map((c) => c.match(/^❝\s*([\d,]+)$/)?.[1])
    .filter(Boolean)
    .map((n) => Number(n.replaceAll(',', '')));

async function waitSkeletonsGone(scope, timeout) {
  await scope.locator('.kl-skeleton').first().waitFor({ state: 'hidden', timeout }).catch(() => {});
}

// ---------------------------------------------------------------------------

const userDataDir = mkdtempSync(join(tmpdir(), 'kenlens-e2e-'));
const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium',
  headless: !HEADED,
  viewport: { width: 1280, height: 800 },
  locale: 'ja-JP',
  // researchmap は HeadlessChrome UA を 403 で弾くため通常 Chrome の UA にする
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});

try {
  step('拡張の起動確認');
  let [sw] = context.serviceWorkers();
  sw ??= await context.waitForEvent('serviceworker', { timeout: 15_000 });
  const extId = new URL(sw.url()).host;
  check('service worker が起動', !!extId);

  // onInstalled で welcome タブが自動で開く
  const welcomePage = await (async () => {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const p = context.pages().find((p) => p.url().includes('welcome.html'));
      if (p) return p;
      await new Promise((r) => setTimeout(r, 300));
    }
    return null;
  })();
  check('初回インストールで welcome ページが開く', !!welcomePage);
  if (welcomePage) {
    await welcomePage.waitForLoadState('networkidle');
    const body = await welcomePage.innerText('body');
    check('welcome に免責文がある', body.includes('研究評価ではなく'));
    await welcomePage.screenshot({ path: join(SHOTS, '00-welcome.png') });
    await welcomePage.close();
  }

  // -------------------------------------------------------------------------
  step(`P1: STEM プロフィール (${STEM})`);
  const page = await context.newPage();
  await page.goto(`https://researchmap.jp/${STEM}`, { waitUntil: 'domcontentloaded' });

  await page.locator('kenlens-badges').first().waitFor({ timeout: 30_000 });
  const badgeCount = await page.locator('kenlens-badges').count();
  check(`バッジ行がマウントされる (${badgeCount} 行)`, badgeCount > 0);

  const summary = page.locator('kenlens-summary');
  check('サマリーカードが表示される', await summary.isVisible());

  // 可視アイテムのエンリッチ完了を待つ (被引用チップの出現)
  await page
    .locator('kenlens-badges')
    .filter({ hasText: '❝' })
    .first()
    .waitFor({ timeout: 90_000 });
  const chips = await chipList(page);
  const counts = citeCounts(chips);
  check('被引用チップが表示される', counts.some((n) => n >= 1));
  check('「❝ 0」チップが無い', !counts.includes(0));
  check('OA チップが表示される', chips.includes('OA'));
  check('DOI チップが表示される', chips.includes('DOI'));

  // サマリーの全件エンリッチ完了 (スケルトン消滅) を待って検査
  await waitSkeletonsGone(summary, 150_000);
  const cardText = await shadowText(summary);
  check('率が分数主表示 (n / m)', /\d+\s*\/\s*\d+/.test(cardText));
  check('被引用合計に分母併記 (照合済み)', cardText.includes('照合済み'));
  check('免責文がカード footer にある', cardText.includes('研究評価ではなく'));
  check('Powered by researchmap がある', cardText.includes('Powered by researchmap'));
  check('取得時点が表示される', cardText.includes('時点'));

  // 共著者の自己除外 (本人の漢字・カナ・ローマ字いずれもカードに出ない)
  const selfNames = await page.evaluate(() => {
    const out = [];
    const push = (raw) => {
      if (!raw) return;
      for (const part of raw.split(/[()（）]/)) {
        const name = part.replace(/[\s　]+/g, ' ').trim();
        if (name) out.push(name);
      }
    };
    const h1 = document.querySelector('h1.rm-researcher-name');
    push(h1?.textContent);
    push(document.querySelector('.rm-ruby')?.textContent);
    return out;
  });
  const selfInCard = selfNames.filter((n) => cardText.includes(n));
  check('よく共著する研究者に本人が出ない', selfInCard.length === 0, selfInCard.join(', '));

  const offenders1 = await scanForbiddenColors(page);
  check('禁止色 (赤/橙/黄) が無い', offenders1.length === 0, offenders1.join(' | '));

  await page.screenshot({ path: join(SHOTS, '01-stem-page.png') });
  await summary.screenshot({ path: join(SHOTS, '02-stem-summary.png') });

  // ツールチップ (hover で出典+時点)
  const citeChip = page.locator('kenlens-badges a').filter({ hasText: '❝' }).first();
  await citeChip.hover();
  const tooltip = page.locator('kenlens-badges [role="tooltip"]').first();
  await tooltip.waitFor({ timeout: 5_000 }).catch(() => {});
  const tooltipText = (await tooltip.isVisible().catch(() => false))
    ? await tooltip.innerText()
    : '';
  check('ツールチップに出典 (OpenAlex/Crossref) がある', /OpenAlex|Crossref/.test(tooltipText), tooltipText);
  check('ツールチップに取得時点がある', tooltipText.includes('時点'), tooltipText);

  // ◎ ポップオーバー (クリック → 表示 → Esc で閉じる)
  const glyph = page.locator('kenlens-badges button[aria-haspopup="dialog"]').first();
  await glyph.click();
  const dialog = page.locator('kenlens-badges [role="dialog"]').first();
  await dialog.waitFor({ timeout: 5_000 });
  const dialogText = await dialog.innerText();
  check('ポップオーバーにデータクレジットがある', dialogText.includes('OpenAlex'));
  check('ポップオーバーに誤り報告リンクがある', dialogText.includes('報告'));
  await page.screenshot({ path: join(SHOTS, '03-popover.png') });
  await page.keyboard.press('Escape');
  check('Esc でポップオーバーが閉じる', !(await dialog.isVisible().catch(() => false)));

  // 折りたたみの永続化
  await summary.locator('button', { hasText: '折りたたむ' }).click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('kenlens-summary').waitFor({ timeout: 20_000 });
  const collapsedText = await shadowText(page.locator('kenlens-summary'));
  check('折りたたみ状態がリロード後も保持される', collapsedText.includes('展開する'));
  await page.locator('kenlens-summary').locator('button', { hasText: '展開する' }).click();

  // 共有カード (v0.4): ダイアログ → canvas 描画 → Esc で閉じる
  const shareBtn = page
    .locator(
      'kenlens-summary button[aria-label="画像で共有"], kenlens-summary button[aria-label="Share as image"]',
    )
    .first();
  await shareBtn.waitFor({ timeout: 60_000 });
  await shareBtn.click();
  const shareDialog = page.locator('kenlens-summary [role="dialog"]').first();
  await shareDialog.waitFor({ timeout: 5_000 });
  const dataLen = await shareDialog
    .locator('canvas')
    .evaluate((c) => c.toDataURL('image/png').length);
  check(`共有カードの canvas が描画される (${Math.round(dataLen / 1024)}KB)`, dataLen > 30_000);
  const shareText = await shadowText(page.locator('kenlens-summary'));
  check('共有ダイアログに利用ノートがある', /記録・共有用|your own profile/.test(shareText));
  await page.screenshot({ path: join(SHOTS, '08-share-card.png') });
  await page.keyboard.press('Escape');
  check('Esc で共有ダイアログが閉じる', !(await shareDialog.isVisible().catch(() => false)));

  // 2 回目ロードはキャッシュで高速 (researchmap API を再度叩かない)
  const rmRequests = [];
  page.on('request', (req) => {
    if (req.url().includes('api.researchmap.jp')) rmRequests.push(req.url());
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('kenlens-badges').filter({ hasText: '❝' }).first().waitFor({ timeout: 30_000 });
  check('リロード時に researchmap API を再取得しない (24h キャッシュ)', rmRequests.length === 0);

  // -------------------------------------------------------------------------
  step(`P2: 人文系プロフィール (${HUM})`);
  const page2 = await context.newPage();
  await page2.goto(`https://researchmap.jp/${HUM}`, { waitUntil: 'domcontentloaded' });
  await page2.locator('kenlens-badges').first().waitFor({ timeout: 30_000 });
  await page2.waitForTimeout(15_000); // エンリッチの settle を待つ
  await waitSkeletonsGone(page2.locator('body'), 60_000);

  const chips2 = await chipList(page2);
  check('「❝ 0」チップが無い (人文系)', !citeCounts(chips2).includes(0));
  const silentRows = (await badgeTextList(page2)).filter((t) => t.trim() === '').length;
  check(`データ無し行は ◎ のみで沈黙 (${silentRows} 行)`, silentRows >= 0);
  const offenders2 = await scanForbiddenColors(page2);
  check('禁止色が無い (人文系)', offenders2.length === 0, offenders2.join(' | '));
  await page2.screenshot({ path: join(SHOTS, '04-hum-page.png') });
  await page2.close();

  // -------------------------------------------------------------------------
  step('P3: 英語ページ (?lang=en)');
  const page3 = await context.newPage();
  await page3.goto(`https://researchmap.jp/${STEM}?lang=en`, { waitUntil: 'domcontentloaded' });
  await page3.locator('kenlens-badges').first().waitFor({ timeout: 30_000 });
  const ariaLabel = await page3
    .locator('kenlens-badges button[aria-haspopup="dialog"]')
    .first()
    .getAttribute('aria-label');
  check('UI がページ言語 (en) に追従する', (ariaLabel ?? '').startsWith('KenLens'), ariaLabel ?? '');
  const summaryEn = await shadowText(page3.locator('kenlens-summary'));
  check('サマリーも英語になる', summaryEn.includes('KenLens Summary'));
  await page3.screenshot({ path: join(SHOTS, '05-en-page.png') });
  await page3.close();

  // -------------------------------------------------------------------------
  step('P4: 不存在ページには注入しない');
  const page4 = await context.newPage();
  await page4.goto('https://researchmap.jp/__kenlens_nonexistent__', {
    waitUntil: 'domcontentloaded',
  });
  await page4.waitForTimeout(3_000);
  check(
    '403 ページにバッジ/カードが無い',
    (await page4.locator('kenlens-badges').count()) === 0 &&
      (await page4.locator('kenlens-summary').count()) === 0,
  );
  await page4.close();

  // -------------------------------------------------------------------------
  step('P5: 設定の即時反映 (Options)');
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extId}/options.html`);
  await options.locator('h1').waitFor({ timeout: 10_000 });
  await options.screenshot({ path: join(SHOTS, '06-options.png') });

  await options.getByRole('switch', { name: '被引用数' }).click();
  await page.waitForTimeout(1_500); // storage.onChanged の伝播
  check(
    '被引用バッジ OFF が開いているタブへ即時反映',
    citeCounts(await chipList(page)).length === 0,
  );
  await options.getByRole('switch', { name: '被引用数' }).click();
  await page.waitForTimeout(1_500);
  check('ON に戻すと再表示', citeCounts(await chipList(page)).length > 0);

  // -------------------------------------------------------------------------
  step('P6: DOM-only 縮退モード');
  await options.getByLabel('動作モード').selectOption('dom-only');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('kenlens-summary').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(2_000);
  // P3 で ?lang=en を踏むと researchmap がセッション言語を英語に切り替えるため、両言語を許容する
  const degradedText = await shadowText(page.locator('kenlens-summary'));
  check(
    '縮退モードで「限定モード」表示',
    /限定モード|Limited mode/.test(degradedText),
    degradedText.slice(-160),
  );
  await page.screenshot({ path: join(SHOTS, '07-dom-only.png') });
  await options.getByLabel('動作モード').selectOption('auto');
  await options.close();

  // -------------------------------------------------------------------------
  step('P7: 整備レポート (v0.3)');
  const report = await context.newPage();
  await report.goto(`chrome-extension://${extId}/report.html?permalink=${STEM}`);
  await report.locator('h1').waitFor({ timeout: 10_000 });

  // OpenAlex 著者推定 + 全論文取得の完了を待つ (researchmap キャッシュ済みなら数十秒)
  await report
    .locator('text=/推定された著者|Inferred author|推定できませんでした|Could not infer/')
    .first()
    .waitFor({ timeout: 180_000 });
  const reportBody = await report.innerText('body');
  check('著者が推定される', /推定された著者|Inferred author/.test(reportBody), reportBody.slice(0, 300));
  check(
    '未登録候補リストが出る',
    /researchmapに見つからない論文|not found on researchmap|差分は見つかりませんでした|No gaps found/.test(reportBody),
  );
  check('同名混入の注意書きがある', /同名研究者|same name/.test(reportBody));
  check(
    '突合対象の開示がある (MISC・書籍まで突合)',
    /突合対象: researchmap上の論文・MISC・書籍|Compared against papers, misc, and books/.test(
      reportBody,
    ),
  );

  // BibTeX 突合 (架空エントリ → 1件解析 → 差分に出る)
  await report
    .locator('textarea')
    .fill(
      '@article{yamada2024fict, title={A Totally Fictitious Paper for E2E}, author={Yamada, Taro}, journal={Test Journal}, year={2024}}',
    );
  await report.waitForTimeout(1_000); // parse debounce
  const afterBibtex = await report.innerText('body');
  check('BibTeX が解析される', /1件のエントリ|Parsed 1 entr/.test(afterBibtex), afterBibtex.slice(-300));

  const firstCheckbox = report.locator('input[type="checkbox"]').first();
  await firstCheckbox.check();
  const dlButton = report
    .locator('button')
    .filter({ hasText: /researchmapインポート用|researchmap import/ })
    .first();
  check('選択すると researchmap 用ダウンロードが有効になる', await dlButton.isEnabled());
  await report.screenshot({ path: join(SHOTS, '09-report.png') });
  await report.close();

  // -------------------------------------------------------------------------
  const failed = results.filter((r) => !r.ok);
  console.log(`\n結果: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  ✗ ${f.name} ${f.detail}`);
  }
  console.log(`スクショ: ${SHOTS}`);
  process.exitCode = failed.length > 0 ? 1 : 0;
} finally {
  await context.close();
}
