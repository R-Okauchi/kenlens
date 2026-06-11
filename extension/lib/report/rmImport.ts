/**
 * researchmap インポート用 JSONL の生成。
 *
 * 形式 (v2API.pdf §3.1.3 一括更新 / マイポータル「研究者・業績インポート」と同一):
 * - 1 行に 1 業績の JSONL。UTF-8、最大 10MB
 * - {"insert": {"type": "published_papers"}, "similar_merge": {...業績フィールド...},
 *    "priority": "input_data"}
 *   similar_merge を使う理由: 単純な merge は類似業績が既にあるとエラーになるが、
 *   similar_merge は入力データ優先でマージされるため、突合漏れがあっても安全
 * - user_id は本人ログインでのインポートでは省略可 (CSV 定義書の研究者権限の注記と同等)
 * - publication_date は必須 — 出版年が不明な候補は含められない (戻り値で開示する)
 */
import { isLatinTitle } from '../enrich/match';
import type { ReportCandidate } from './types';

interface RmLocalized {
  ja?: string;
  en?: string;
}

interface RmImportPaper {
  paper_title: RmLocalized;
  publication_date: string;
  publication_name?: RmLocalized;
  authors?: { ja?: { name: string }[]; en?: { name: string }[] };
  identifiers?: { doi: string[] };
}

export interface RmImportResult {
  jsonl: string;
  /** ファイルに含めた件数 */
  included: number;
  /** 出版年不明で含められなかった件数 (researchmap 側で必須のため) */
  skippedNoDate: number;
}

function localized(text: string): RmLocalized {
  return isLatinTitle(text) ? { en: text } : { ja: text };
}

function toImportPaper(c: ReportCandidate): RmImportPaper | null {
  if (c.year === null) return null;

  const paper: RmImportPaper = {
    paper_title: localized(c.title),
    publication_date: String(c.year),
  };
  if (c.venue) paper.publication_name = localized(c.venue);
  if (c.authors) {
    const names = c.authors
      .split(/\s+and\s+/i)
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => ({ name }));
    if (names.length > 0) {
      paper.authors = isLatinTitle(c.authors) ? { en: names } : { ja: names };
    }
  }
  if (c.doi) paper.identifiers = { doi: [c.doi] };
  return paper;
}

export function generateRmImportJsonl(
  candidates: readonly ReportCandidate[],
): RmImportResult {
  const lines: string[] = [];
  let skippedNoDate = 0;

  for (const c of candidates) {
    const paper = toImportPaper(c);
    if (!paper) {
      skippedNoDate++;
      continue;
    }
    // 「必ず 1 行に 1 業績」 — pretty print 禁止
    lines.push(
      JSON.stringify({
        insert: { type: 'published_papers' },
        similar_merge: paper,
        priority: 'input_data',
      }),
    );
  }

  return { jsonl: lines.join('\n') + (lines.length > 0 ? '\n' : ''), included: lines.length, skippedNoDate };
}
