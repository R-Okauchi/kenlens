import { describe, expect, it } from 'vitest';
import { detectPage } from '../lib/page/detect';
import { fixturesAvailable, loadHtml } from './helpers/fixtures';

const u = (path: string) => new URL(`https://researchmap.jp${path}`);

describe.skipIf(!fixturesAvailable())('detectPage', () => {
  const profileDoc = loadHtml('profile-stem.html');
  const listDoc = loadHtml('papers-stem-p1.html');
  const enDoc = loadHtml('papers-stem-en.html');
  const notFoundDoc = loadHtml('profile-403.html');

  it('プロフィールトップを判定する', () => {
    expect(detectPage(u('/some_researcher'), profileDoc)).toEqual({
      permalink: 'some_researcher',
      pageType: 'profile-top',
      listType: null,
      lang: 'ja',
    });
  });

  it('論文一覧ページを判定する (ページング付きURLも)', () => {
    const expected = {
      permalink: 'some_researcher',
      pageType: 'list',
      listType: 'published_papers',
      lang: 'ja',
    };
    expect(detectPage(u('/some_researcher/published_papers'), listDoc)).toEqual(expected);
    expect(detectPage(u('/some_researcher/published_papers?limit=20&start=21'), listDoc)).toEqual(
      expected,
    );
  });

  it('英語ページは lang=en になる', () => {
    expect(detectPage(u('/some_researcher/published_papers?lang=en'), enDoc)?.lang).toBe('en');
  });

  it('403/不存在ページ (マーカー無し) は null', () => {
    expect(detectPage(u('/__kenlens_nonexistent__'), notFoundDoc)).toBeNull();
  });

  it('予約ルートは null', () => {
    for (const p of ['/public/terms', '/researchers', '/search', '/signin']) {
      expect(detectPage(u(p), profileDoc)).toBeNull();
    }
  });

  it('MVP 対象外の業績種別一覧は null', () => {
    expect(detectPage(u('/some_researcher/presentations'), listDoc)).toBeNull();
  });

  it('researchmap.jp 以外のホストは null', () => {
    expect(detectPage(new URL('https://example.com/some_researcher'), profileDoc)).toBeNull();
  });
});
