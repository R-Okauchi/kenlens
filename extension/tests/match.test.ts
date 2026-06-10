import { describe, expect, it } from 'vitest';
import {
  RESOLVE_ACCEPT_THRESHOLD,
  extractFirstAuthorFamily,
  isLatinTitle,
  normalizeTitle,
  titleSimilarity,
} from '../lib/enrich/match';

describe('normalizeTitle', () => {
  it('NFKC・小文字化・記号置換で表記揺れを吸収する', () => {
    expect(normalizeTitle('The State of OA: A Large-Scale Analysis!')).toBe(
      normalizeTitle('the state of oa a large scale analysis'),
    );
    expect(normalizeTitle('全角　スペース＆記号')).toBe('全角 スペース 記号');
  });
});

describe('titleSimilarity', () => {
  it('同一タイトル = 1', () => {
    expect(titleSimilarity('A Music Exploration Interface', 'A Music Exploration Interface')).toBe(1);
  });

  it('ピアレビューレコード (タイトル包含ノイズ) は受け入れ閾値未満になる', () => {
    // Crossref query.bibliographic の実ノイズパターン (fixtures で実測)
    const original =
      'The state of OA: a large-scale analysis of the prevalence and impact of Open Access articles';
    const noise = `Peer Review #1 of "${original} (v0.1)"`;
    expect(titleSimilarity(original, noise)).toBeLessThan(RESOLVE_ACCEPT_THRESHOLD);
  });

  it('日本語タイトルは bigram で比較できる', () => {
    const a = '深層学習を用いた橋梁損傷検出の高精度化に関する研究';
    expect(titleSimilarity(a, a)).toBe(1);
    expect(titleSimilarity(a, '地方都市における歴史的橋梁の保存に関する一考察')).toBeLessThan(0.5);
  });

  it('空文字は 0', () => {
    expect(titleSimilarity('', 'abc')).toBe(0);
  });
});

describe('isLatinTitle', () => {
  it.each([
    ['A Music Exploration Interface based on Vocal Timbre', true],
    ['深層学習を用いた橋梁点検画像の損傷自動検出に関する研究', false],
    ['深層学習を用いた橋梁損傷検出のための画像認識手法とCNNの比較', false], // 和文主体 (英字僅少)
    ['', false],
  ])('%s → %s', (title, expected) => {
    expect(isLatinTitle(title)).toBe(expected);
  });
});

describe('extractFirstAuthorFamily', () => {
  it.each([
    ['Taro Yamada, Hanako Sato', 'yamada'],
    ['山田 太郎, 佐藤 花子', '山田'],
    ['鈴木 一、佐藤 花子', '鈴木'],
    ['', null],
  ])('%s → %s', (input, expected) => {
    expect(extractFirstAuthorFamily(input)).toBe(expected);
  });
});
