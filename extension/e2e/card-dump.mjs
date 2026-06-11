/** 共有カード canvas の生 PNG を吸い出すデバッグ用スクリプト */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXT = join(ROOT, '.output', 'chrome-mv3');
const PROFILE = process.env.KENLENS_E2E_STEM ?? 'p_chun';

const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'kl-card-')), {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1280, height: 800 },
  locale: 'ja-JP',
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});

try {
  await new Promise((r) => setTimeout(r, 2500));
  for (const p of context.pages()) if (p.url().includes('welcome.html')) await p.close();

  const page = await context.newPage();
  await page.goto(`https://researchmap.jp/${PROFILE}`, { waitUntil: 'domcontentloaded' });
  const summary = page.locator('kenlens-summary');
  await summary.waitFor({ timeout: 30_000 });
  await summary.locator('.kl-skeleton').first().waitFor({ timeout: 10_000 }).catch(() => {});
  await summary.locator('.kl-skeleton').first().waitFor({ state: 'hidden', timeout: 150_000 }).catch(() => {});
  const btn = page.locator('kenlens-summary button[aria-label="画像で共有"]').first();
  await btn.waitFor({ timeout: 120_000 });
  await btn.click();
  const canvas = page.locator('kenlens-summary [role="dialog"] canvas').first();
  await canvas.waitFor({ timeout: 5_000 });
  await page.waitForTimeout(800);
  const dataUrl = await canvas.evaluate((c) => c.toDataURL('image/png'));
  writeFileSync('/tmp/kl-card-raw.png', Buffer.from(dataUrl.split(',')[1], 'base64'));
  await page.screenshot({ path: '/tmp/kl-card-page.png' });
  console.log('→ /tmp/kl-card-raw.png, /tmp/kl-card-page.png');
} finally {
  await context.close();
}
