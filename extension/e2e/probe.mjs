/** デバッグ用プローブ: ページ読込・UA・content script 注入状況を確認する */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXT = join(ROOT, '.output', 'chrome-mv3');

const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'kl-probe-')), {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1280, height: 800 },
  locale: 'ja-JP',
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});

const page = await context.newPage();
page.on('console', (m) => console.log('[console]', m.type(), m.text().slice(0, 160)));
const res = await page.goto('https://researchmap.jp/p_chun', { waitUntil: 'domcontentloaded' });
console.log('status:', res?.status());
console.log('UA:', await page.evaluate(() => navigator.userAgent));
console.log('title:', await page.title());
console.log('html lang:', await page.evaluate(() => document.documentElement.lang));
console.log('rm-cv markers:', await page.locator('.rm-cv-panel-heading').count());
console.log('list items:', await page.locator('ul.rm-cv-list-group > li.list-group-item').count());
await page.waitForTimeout(5000);
console.log('kenlens-badges:', await page.locator('kenlens-badges').count());
console.log('kenlens-summary:', await page.locator('kenlens-summary').count());
await page.screenshot({ path: '/tmp/kl-probe.png' });
await context.close();
