/**
 * 免責文・クレジットの単一ソース (packages/shared/src/disclaimer.ts) 同期テスト。
 * LP (Astro) はコンパイル境界の都合で文字列を埋め込んでいるため、
 * ここでソースファイルの内容一致を機械的に検証する (乖離 = コンプライアンス事故)。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DISCLAIMER } from '@kenlens/shared/disclaimer';
import { messages } from '../lib/i18n/messages';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('免責文の単一ソース同期', () => {
  it('拡張の i18n は shared を参照している', () => {
    expect(messages.ja.disclaimer).toBe(DISCLAIMER.ja);
    expect(messages.en.disclaimer).toBe(DISCLAIMER.en);
  });

  it('LP (Astro) の埋め込み文字列が shared と一致している', () => {
    const siteDir = join(ROOT, 'site', 'src');
    const astroFiles: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith('.astro')) astroFiles.push(path);
      }
    };
    walk(siteDir);

    const corpus = astroFiles.map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(corpus).toContain(DISCLAIMER.ja);
    expect(corpus).toContain(DISCLAIMER.en);
  });

  it('ストア説明文 (_locales) に免責文が含まれている', () => {
    const ja = readFileSync(
      join(ROOT, 'extension', 'public', '_locales', 'ja', 'messages.json'),
      'utf8',
    );
    expect(ja).toContain(DISCLAIMER.ja);
  });
});
