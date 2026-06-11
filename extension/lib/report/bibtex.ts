/**
 * BibTeX の寛容なパーサと生成器 (依存なし・純関数)。
 * 想定入力: Google Scholar / Zotero / Mendeley のエクスポート。
 * 厳密な BibTeX 文法には従わない — 読める断片を最大限読み、読めない断片は黙って捨てる。
 * 整備レポートは「候補の提示」が目的なので、1 エントリの破損で全体を止める方が害が大きい。
 */
import { normalizeDoi } from '../enrich/doi';
import type { ReportCandidate } from './types';

export interface BibtexEntry {
  type: string;
  key: string;
  fields: Record<string, string>;
}

/** 寛容なパーサ: Google Scholar / Zotero / Mendeley のエクスポートを読めること */
export function parseBibtex(text: string): BibtexEntry[] {
  const entries: BibtexEntry[] = [];
  let i = 0;
  while (i < text.length) {
    const at = text.indexOf('@', i);
    if (at === -1) break;
    // 同じ行の @ より前に % があればコメント行 (一部ツールがヘッダとして付ける) — 行末まで捨てる
    const lineStart = text.lastIndexOf('\n', at) + 1;
    if (text.slice(lineStart, at).includes('%')) {
      const eol = text.indexOf('\n', at);
      i = eol === -1 ? text.length : eol + 1;
      continue;
    }
    const parsed = parseEntryAt(text, at);
    if (parsed === null) {
      // エントリとして読めない @ (メールアドレス等) は 1 文字進めて続行
      i = at + 1;
      continue;
    }
    if (parsed.entry) entries.push(parsed.entry);
    i = parsed.next;
  }
  return entries;
}

/** title 必須。doi は normalizeDoi で正規化。year は数値化。journal ?? booktitle → venue。author そのまま */
export function entryToCandidate(e: BibtexEntry): ReportCandidate | null {
  const title = (e.fields['title'] ?? '').trim();
  if (title === '') return null;
  const doiRaw = e.fields['doi'];
  const yearRaw = e.fields['year'];
  const yearMatch = yearRaw ? /\d{4}/.exec(yearRaw) : null;
  const venue = (e.fields['journal'] ?? e.fields['booktitle'] ?? '').trim();
  const authors = (e.fields['author'] ?? '').trim();
  return {
    // Google Scholar には doi フィールドが無いことが多い → null のまま (タイトル照合に回る)
    doi: doiRaw ? normalizeDoi(doiRaw) : null,
    title,
    year: yearMatch ? Number(yearMatch[0]) : null,
    venue: venue === '' ? null : venue,
    authors: authors === '' ? null : authors,
    source: 'bibtex',
  };
}

export function candidatesFromBibtex(text: string): ReportCandidate[] {
  return parseBibtex(text)
    .map(entryToCandidate)
    .filter((c): c is ReportCandidate => c !== null);
}

/** venue が会議録らしいか (@inproceedings へ振り分ける雑なヒューリスティクス) */
const PROCEEDINGS_RE =
  /proceedings|conference|workshop|symposium|congress|論文集|講演会|シンポジウム|研究発表会/i;

/**
 * researchmap インポート用の BibTeX 生成。
 * フィールドは title / author / year / journal|booktitle / doi のみ (持っている情報だけを出す)。
 * キーは先頭著者姓+年+連番で一意化。値は {} で囲み、中の波括弧とバックスラッシュをエスケープする。
 */
export function generateBibtex(candidates: readonly ReportCandidate[]): string {
  const used = new Set<string>();
  const blocks = candidates.map((c) => {
    const base = `${firstAuthorFamilyKey(c.authors)}${c.year ?? ''}`;
    let key = base;
    for (let n = 2; used.has(key); n++) key = `${base}-${n}`;
    used.add(key);

    const isProc = c.venue !== null && PROCEEDINGS_RE.test(c.venue);
    const type = c.venue === null ? 'misc' : isProc ? 'inproceedings' : 'article';
    const fields: Array<[string, string]> = [['title', c.title]];
    if (c.authors !== null) fields.push(['author', c.authors]);
    if (c.year !== null) fields.push(['year', String(c.year)]);
    if (c.venue !== null) fields.push([isProc ? 'booktitle' : 'journal', c.venue]);
    if (c.doi !== null) fields.push(['doi', c.doi]);
    const body = fields.map(([k, v]) => `  ${k} = {${escapeBibtexValue(v)}}`).join(',\n');
    return `@${type}{${key},\n${body}\n}`;
  });
  return blocks.length === 0 ? '' : `${blocks.join('\n\n')}\n`;
}

// ---------------------------------------------------------------------------
// 内部実装
// ---------------------------------------------------------------------------

interface ParseOutcome {
  /** @comment 等の読み飛ばしブロックでは null */
  entry: BibtexEntry | null;
  next: number;
}

/** at が指す '@' から 1 エントリを読む。エントリの形をしていなければ null */
function parseEntryAt(text: string, at: number): ParseOutcome | null {
  let i = at + 1;
  const typeMatch = /^[A-Za-z]+/.exec(text.slice(i));
  if (!typeMatch) return null;
  const type = typeMatch[0].toLowerCase();
  i += typeMatch[0].length;
  i = skipWs(text, i);
  const open = text[i];
  if (open !== '{' && open !== '(') return null;
  const close = open === '{' ? '}' : ')';
  i++;

  // @comment / @preamble / @string はメタブロック — 括弧の対応だけ取って読み飛ばす
  if (type === 'comment' || type === 'preamble' || type === 'string') {
    return { entry: null, next: skipBalanced(text, i, open, close) };
  }

  // 引用キー: 最初のカンマ (または閉じ括弧) まで。キー無しも許容
  i = skipWs(text, i);
  let j = i;
  while (j < text.length && text[j] !== ',' && text[j] !== close) j++;
  const key = text.slice(i, j).trim();
  if (text[j] === ',') j++;
  i = j;

  const fields: Record<string, string> = {};
  for (;;) {
    i = skipWsAndCommas(text, i); // 末尾カンマ・連続カンマを許容
    if (i >= text.length) break;
    if (text[i] === close) {
      i++;
      break;
    }
    const nameMatch = /^[^\s=,#{}()"]+/.exec(text.slice(i));
    if (!nameMatch) {
      i++; // 解釈できない 1 文字を捨てて前進 (無限ループ防止)
      continue;
    }
    i += nameMatch[0].length;
    i = skipWs(text, i);
    if (text[i] !== '=') continue; // 値の無い断片は無視
    const { value, next } = parseValue(text, i + 1);
    i = next;
    const name = nameMatch[0].toLowerCase(); // フィールド名は大文字小文字を区別しない
    fields[name] = cleanValue(value, name === 'title');
  }
  return { entry: { type, key, fields }, next: i };
}

/** field = の右辺を読む。{} 入れ子・"" 引用・裸の数値/マクロ名・# 連結に対応 */
function parseValue(text: string, start: number): { value: string; next: number } {
  let i = skipWs(text, start);
  const pieces: string[] = [];
  for (;;) {
    if (i >= text.length) break;
    const c = text[i];
    if (c === '{') {
      const end = skipBalanced(text, i + 1, '{', '}');
      pieces.push(text.slice(i + 1, Math.max(i + 1, end - 1)));
      i = end;
    } else if (c === '"') {
      const end = scanQuoted(text, i + 1);
      pieces.push(text.slice(i + 1, Math.max(i + 1, end - 1)));
      i = end;
    } else {
      const m = /^[^\s,#{}()"]+/.exec(text.slice(i));
      if (!m) break;
      pieces.push(m[0]); // 裸の数値 (year = 2024) や未解決の @string マクロ名はそのまま文字列に
      i += m[0].length;
    }
    const k = skipWs(text, i);
    if (text[k] === '#') {
      i = skipWs(text, k + 1); // "a" # "b" 連結
      continue;
    }
    break;
  }
  return { value: pieces.join(''), next: i };
}

/** start は開き括弧の次。対応する閉じ括弧の次の位置を返す (\ は次の 1 文字を保護) */
function skipBalanced(text: string, start: number, open: string, close: string): number {
  let depth = 1;
  let i = start;
  while (i < text.length && depth > 0) {
    const c = text[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === open) depth++;
    else if (c === close) depth--;
    i++;
  }
  return i;
}

/** start は開きクォートの次。閉じクォートの次の位置を返す ({} 内の " は閉じ扱いしない) */
function scanQuoted(text: string, start: number): number {
  let i = start;
  let depth = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') depth = Math.max(0, depth - 1);
    else if (c === '"' && depth === 0) return i + 1;
    i++;
  }
  return i;
}

/**
 * 値の後処理: 二重括弧 {{...}} の余分な外殻を剥がし、改行/連続空白を 1 個に畳み、
 * title では保護用の波括弧 ({Deep {L}earning}) を除去し、エスケープ (\& \% \_ \{ \} \\) を解除する。
 */
function cleanValue(raw: string, isTitle: boolean): string {
  let v = raw;
  while (isWrappedInBraces(v)) v = v.slice(1, -1);
  if (isTitle) v = stripUnescapedBraces(v);
  v = v.replace(/\s+/g, ' ').trim();
  v = v.replace(/\\([&%_{}\\])/g, '$1');
  return v;
}

/** 文字列全体が対応の取れた 1 組の {} に包まれているか */
function isWrappedInBraces(v: string): boolean {
  if (v.length < 2 || !v.startsWith('{') || !v.endsWith('}')) return false;
  let depth = 0;
  for (let i = 0; i < v.length; i++) {
    const c = v[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i === v.length - 1; // 最後で閉じる場合のみ外殻
    }
  }
  return false;
}

/** エスケープされていない波括弧だけを取り除く (\{ \} はリテラルとして残す) */
function stripUnescapedBraces(v: string): string {
  let out = '';
  for (let i = 0; i < v.length; i++) {
    const c = v[i]!;
    if (c === '\\' && i + 1 < v.length) {
      out += c + v[i + 1];
      i++;
      continue;
    }
    if (c === '{' || c === '}') continue;
    out += c;
  }
  return out;
}

function skipWs(text: string, i: number): number {
  while (i < text.length && /\s/.test(text[i]!)) i++;
  return i;
}

function skipWsAndCommas(text: string, i: number): number {
  while (i < text.length && /[\s,]/.test(text[i]!)) i++;
  return i;
}

/**
 * 引用キー用の先頭著者姓。"Family, Given and ..." はカンマ前、"Given Family" は末尾語。
 * BibTeX キーとして安全な ASCII 英数字に落とす (和文姓など落ちきる場合は noauthor)。
 */
function firstAuthorFamilyKey(authors: string | null): string {
  if (authors === null) return 'noauthor';
  const first = authors.split(/\s+and\s+/i)[0]?.trim() ?? '';
  const comma = first.indexOf(',');
  const family = comma >= 0 ? first.slice(0, comma) : (first.split(/[\s　]+/).at(-1) ?? '');
  const key = family
    .normalize('NFKD') // Müller → Muller のようにアクセントを分解して捨てる
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return key === '' ? 'noauthor' : key;
}

/** {} 値の中で意味を持つ波括弧とバックスラッシュをエスケープする */
function escapeBibtexValue(s: string): string {
  return s.replace(/[\\{}]/g, (m) => `\\${m}`);
}
