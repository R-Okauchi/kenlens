// @vitest-environment node
/**
 * ライブ検証 (実 API を叩く)。通常のテスト実行・CI では自動 skip。
 * 実行: KENLENS_LIVE=1 pnpm exec vitest run tests/live-check.test.ts
 *
 * 検証内容 = M2 受け入れ基準: 実プロフィールで researchmap → OpenAlex/Crossref の
 * 全経路が実装モジュールそのもので通ること。
 * (node 環境指定: happy-dom はクロスオリジン fetch をブロックするため)
 */
import { describe, expect, it } from 'vitest';
import { fetchAllPublications } from '../lib/researchmap/api';
import { fetchOpenAlexByDoi } from '../lib/enrich/openalex';
import { fetchCrossrefByDoi, resolveTitleViaCrossref } from '../lib/enrich/crossref';
import { extractFirstAuthorFamily, isLatinTitle } from '../lib/enrich/match';
import { paperYear } from '../lib/metrics/summary';

const LIVE = process.env.KENLENS_LIVE === '1';

describe.skipIf(!LIVE)('live: 実 API 経路検証', () => {
  it(
    'researchmap → OpenAlex → Crossref の全経路が実モジュールで通る',
    { timeout: 120_000 },
    async () => {
      const permalink = process.env.KENLENS_LIVE_PERMALINK ?? 'p_chun';
      const { totalItems, papers } = await fetchAllPublications(permalink);
      console.log(`researchmap: ${permalink} → total=${totalItems}, fetched=${papers.length}`);
      expect(totalItems).toBeGreaterThan(0);
      expect(papers.length).toBeGreaterThan(0);

      const withDoi = papers.filter((p) => p.dois.length > 0);
      console.log(`DOI あり: ${withDoi.length}/${papers.length}`);
      expect(withDoi.length).toBeGreaterThan(0);

      let found = 0;
      for (const p of withDoi.slice(0, 10)) {
        const doi = p.dois[0]!;
        const work = await fetchOpenAlexByDoi(doi);
        console.log(
          work
            ? `  ✓ ${doi} cited_by=${work.citedByCount} oa=${work.isOa} xpac=${work.isXpac}`
            : `  404 ${doi}`,
        );
        if (work) found++;
      }
      expect(found).toBeGreaterThan(0);

      const cr = await fetchCrossrefByDoi('10.7717/peerj.4375');
      console.log(`Crossref: 10.7717/peerj.4375 → cited_by=${cr?.citedByCount}`);
      expect(cr?.citedByCount).toBeGreaterThan(500);

      const noDoi = papers.find(
        (p) => p.dois.length === 0 && isLatinTitle(p.titleEn ?? p.titleJa ?? ''),
      );
      if (noDoi) {
        const title = noDoi.titleEn ?? noDoi.titleJa!;
        const resolved = await resolveTitleViaCrossref(
          title,
          paperYear(noDoi),
          extractFirstAuthorFamily((noDoi.authorsEn[0] ?? noDoi.authorsJa[0]) ?? ''),
        );
        console.log(`タイトル照合: "${title.slice(0, 50)}" →`, resolved ?? '棄却 (三重ゲート)');
      }
    },
  );
});
