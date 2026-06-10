/**
 * Chrome Web Store 提出用スクリーンショット撮影 (1280x800、ja/en 各5枚)。
 *
 *   pnpm build && node e2e/store-shots.mjs
 *
 * 出力: e2e/shots/store/ (実在研究者ページを含むため gitignore 済み)。
 * 対象プロフィールは env で変更できる
 */
import { mkdtempSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXT = join(ROOT, '.output', 'chrome-mv3');
const OUT = join(ROOT, 'e2e', 'shots', 'store');
const PROFILE = process.env.KENLENS_E2E_STEM ?? 'p_chun';

if (!existsSync(join(EXT, 'manifest.json'))) {
  console.error(`built extension not found: ${EXT} — run \`pnpm build\` first`);
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const context = await chromium.launchPersistentContext(
  mkdtempSync(join(tmpdir(), 'kenlens-shots-')),
  {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1, // CWS は 1280x800 ぴったりを要求する
    locale: 'ja-JP',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  },
);

const shot = async (page, name) => {
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`  📸 ${name}.png`);
};

const waitChips = (page) =>
  page.locator('kenlens-badges').filter({ hasText: '❝' }).first().waitFor({ timeout: 90_000 });

const waitSummaryReady = async (page) => {
  const summary = page.locator('kenlens-summary');
  await summary.waitFor({ timeout: 30_000 });
  await summary
    .locator('.kl-skeleton')
    .first()
    .waitFor({ state: 'hidden', timeout: 150_000 })
    .catch(() => {});
};

try {
  let [sw] = context.serviceWorkers();
  sw ??= await context.waitForEvent('serviceworker', { timeout: 15_000 });
  const extId = new URL(sw.url()).host;

  // welcome タブを閉じる
  await new Promise((r) => setTimeout(r, 2_500));
  for (const p of context.pages()) {
    if (p.url().includes('welcome.html')) await p.close();
  }

  for (const lang of ['ja', 'en']) {
    console.log(`\n== ${lang} ==`);
    const suffix = lang === 'en' ? '?lang=en' : '';
    const page = await context.newPage();

    // --- 1. 論文リスト全景 (バッジ複数行) ---
    await page.goto(`https://researchmap.jp/${PROFILE}/published_papers${suffix}`, {
      waitUntil: 'domcontentloaded',
    });
    await waitChips(page);
    await page.waitForTimeout(2_500); // 残りの行のフェードイン待ち
    // 論文リストがフレームを占めるよう、パネル見出しを上端に合わせる
    await page.evaluate(() => {
      document.querySelector('#published_papers')?.scrollIntoView();
      window.scrollBy(0, -6);
    });
    await page.mouse.move(0, 0);
    await shot(page, `${lang}-1-list`);

    // --- 2. 被引用チップのツールチップ (出典+時点) ---
    const citeChip = page.locator('kenlens-badges a').filter({ hasText: '❝' }).first();
    await citeChip.scrollIntoViewIfNeeded();
    await page.mouse.move(640, 400); // 一旦チップ外へ
    await citeChip.hover();
    await page
      .locator('kenlens-badges [role="tooltip"]')
      .first()
      .waitFor({ timeout: 5_000 });
    await page.waitForTimeout(300);
    await shot(page, `${lang}-2-tooltip`);
    await page.mouse.move(0, 0);

    // --- 4. DOI候補ポップオーバー (整備フロー)。無ければ ◎ の出典ポップオーバー ---
    const hintChip = page
      .locator('kenlens-badges button')
      .filter({ hasText: 'DOI' })
      .filter({ hasText: '✎' })
      .first();
    if (await hintChip.count()) {
      await hintChip.scrollIntoViewIfNeeded();
      await hintChip.click();
    } else {
      console.log('  (DOI候補チップなし — ◎ ポップオーバーで代替)');
      const glyph = page.locator('kenlens-badges button[aria-haspopup="dialog"]').first();
      await glyph.scrollIntoViewIfNeeded();
      await glyph.click();
    }
    await page.locator('kenlens-badges [role="dialog"]').first().waitFor({ timeout: 5_000 });
    await page.waitForTimeout(300);
    await shot(page, `${lang}-4-popover`);
    await page.keyboard.press('Escape');

    // --- 3. サマリーカード (分母つき + 免責文) ---
    await page.goto(`https://researchmap.jp/${PROFILE}${suffix}`, {
      waitUntil: 'domcontentloaded',
    });
    await waitSummaryReady(page);
    await page.locator('kenlens-summary').scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await shot(page, `${lang}-3-summary`);
    await page.close();

    // --- 5. Options ページ (en は言語を切り替えてから) ---
    const options = await context.newPage();
    await options.goto(`chrome-extension://${extId}/options.html`);
    await options.locator('h1').waitFor({ timeout: 10_000 });
    if (lang === 'en') {
      await options.getByLabel(/言語|Language/).selectOption('en');
      await options.waitForTimeout(500);
    }
    // shot-list 要件: バッジトグル群・動作モード・「キャッシュを消去」が同一フレームに入る位置
    await options.evaluate(() => window.scrollTo(0, 260));
    await shot(options, `${lang}-5-options`);
    if (lang === 'en') {
      await options.getByLabel(/言語|Language/).selectOption('auto');
    }
    await options.close();
  }

  console.log(`\n出力: ${OUT}`);
} finally {
  await context.close();
}
