import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

/**
 * fixtures は実在研究者ページのスナップショットのため公開リポジトリに含めない
 * (researchmap データの再配布になる)。`bash scripts/save-fixtures.sh` で取得する。
 * 未取得の環境 (CI 等) では依存テストを skip する。
 */
export function fixturesAvailable(): boolean {
  return existsSync(join(FIXTURES, 'html')) && existsSync(join(FIXTURES, 'api'));
}

/** fixtures 不在時は空ドキュメントを返す (describe.skipIf と併用 — モジュール評価を壊さないため) */
export function loadHtml(name: string): Document {
  const path = join(FIXTURES, 'html', name);
  if (!existsSync(path)) return new DOMParser().parseFromString('<html></html>', 'text/html');
  return new DOMParser().parseFromString(readFileSync(path, 'utf8'), 'text/html');
}

export function loadJson<T = unknown>(name: string): T {
  const path = join(FIXTURES, 'api', name);
  if (!existsSync(path)) return {} as T;
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}
