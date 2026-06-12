/**
 * OpenAlex 著者推定 (background SW)。
 * researchmap で照合済みの DOI 群から work の著者リストを取り、多数決で本人の
 * OpenAlex 著者 ID を推定する。共著者は論文ごとに入れ替わるが本人は毎回現れる、
 * という性質を使う。同名研究者の混入があり得るため、結果は常に「推定」として
 * 扱い、UI は確信度 (votes/samples) を開示して本人確認を必須にする。
 */
import { fetchAuthorWorks, fetchWorkAuthorships } from '../enrich/openalex';
import type { AuthorWork, AuthorWorksResponse } from '../enrich/openalex';
import { normalizeTitle } from '../enrich/match';
import type { AuthorInference, AuthorWorksResult, ReportCandidate } from './types';

type AuthorHit = { id: string; displayName: string };

/** 有効サンプル (著者リスト付きで取得できた work) の目標数 */
const MAX_SAMPLES = 10;
/** リクエスト総数の上限 (JaLC 系 xpac レコードは著者情報が空のため空振りがあり得る) */
const MAX_ATTEMPTS = 25;
/** 採用する最低出現率 (これ未満なら「推定できず」を返す) */
const MIN_VOTE_RATIO = 0.6;
/** 最低サンプル数 (少なすぎる推定は危険) */
const MIN_SAMPLES = 3;

/**
 * 先頭 (=最新) に固まらないよう、リスト全体からストライドで抽出する。
 * 直近の論文だけだと同一誌・同時期に偏り、xpac 空振りが連続しやすい。
 */
function spreadOrder(dois: readonly string[]): string[] {
  const unique = [...new Set(dois)];
  const stride = Math.max(1, Math.ceil(unique.length / MAX_ATTEMPTS));
  const ordered: string[] = [];
  for (let offset = 0; offset < stride; offset++) {
    for (let i = offset; i < unique.length; i += stride) ordered.push(unique[i]!);
  }
  return ordered;
}

function normalizeDisplayName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

export async function inferAuthor(dois: readonly string[]): Promise<AuthorInference | null> {
  const tally = new Map<string, { displayName: string; votes: number }>();
  const samples: AuthorHit[][] = [];
  let successes = 0;
  let attempts = 0;

  for (const doi of spreadOrder(dois)) {
    if (successes >= MAX_SAMPLES || attempts >= MAX_ATTEMPTS) break;
    attempts++;
    let authors: { id: string; displayName: string }[] | null = null;
    try {
      authors = await fetchWorkAuthorships(doi);
    } catch {
      continue; // トランスポート失敗はサンプルから除外
    }
    // 404 と著者情報なし (xpac 等) は有効サンプルに数えない
    if (!authors || authors.length === 0) continue;
    const sample: AuthorHit[] = [];
    const seenInWork = new Set<string>();
    for (const a of authors) {
      if (seenInWork.has(a.id)) continue;
      seenInWork.add(a.id);
      sample.push(a);
      const entry = tally.get(a.id);
      if (entry) entry.votes++;
      else tally.set(a.id, { displayName: a.displayName, votes: 1 });
    }
    samples.push(sample);
    successes++;
  }

  if (successes < MIN_SAMPLES) return null;

  const [top] = [...tally.entries()].sort((a, b) => b[1].votes - a[1].votes);
  if (!top) return null;
  if (top[1].votes / successes >= MIN_VOTE_RATIO) {
    return {
      authorId: top[0],
      authorIds: [top[0]],
      displayName: top[1].displayName,
      worksCount: 0, // fetchAuthorWorks 後に判明する件数で上書きする
      samples: successes,
      votes: top[1].votes,
    };
  }

  const groups = new Map<string, { votes: number; ids: Set<string> }>();
  for (const sample of samples) {
    const seenGroups = new Set<string>();
    for (const a of sample) {
      const nameKey = normalizeDisplayName(a.displayName);
      if (nameKey === '') continue;
      let group = groups.get(nameKey);
      if (!group) {
        group = { votes: 0, ids: new Set() };
        groups.set(nameKey, group);
      }
      group.ids.add(a.id);
      if (seenGroups.has(nameKey)) continue;
      seenGroups.add(nameKey);
      group.votes++;
    }
  }

  const [bestGroup] = [...groups.values()].sort((a, b) => b.votes - a.votes);
  if (!bestGroup || bestGroup.votes / successes < MIN_VOTE_RATIO) return null;

  const authorIds = [...bestGroup.ids]
    .sort((a, b) => (tally.get(b)?.votes ?? 0) - (tally.get(a)?.votes ?? 0))
    .slice(0, 3);
  const primary = authorIds[0];
  if (!primary) return null;
  const primaryEntry = tally.get(primary);
  if (!primaryEntry) return null;

  return {
    authorId: primary,
    authorIds,
    displayName: primaryEntry.displayName,
    worksCount: 0,
    samples: successes,
    votes: bestGroup.votes,
  };
}

export async function buildAuthorReport(
  dois: readonly string[],
): Promise<AuthorWorksResult | null> {
  const author = await inferAuthor(dois);
  if (!author) return null;

  const authorWorks: AuthorWorksResponse[] = [];
  const uniqueWorks = new Map<string, AuthorWork>();
  for (const authorId of author.authorIds) {
    const result = await fetchAuthorWorks(authorId);
    authorWorks.push(result);
    for (const work of result.works) {
      const key = work.doi ?? `t:${normalizeTitle(work.title)}`;
      if (!uniqueWorks.has(key)) uniqueWorks.set(key, work);
    }
  }

  const works = [...uniqueWorks.values()];
  const single = authorWorks[0];
  const worksCount =
    author.authorIds.length === 1 && single && single.totalCount > single.works.length
      ? single.totalCount
      : works.length;

  const candidates: ReportCandidate[] = works.map((w) => ({
    doi: w.doi,
    title: w.title,
    year: w.year,
    venue: w.venue,
    authors: w.authors,
    source: 'openalex-author',
  }));

  return { author: { ...author, worksCount }, candidates };
}
