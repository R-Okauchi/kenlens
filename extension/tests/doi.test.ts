import { describe, expect, it } from 'vitest';
import { dedupeDois, normalizeDoi } from '../lib/enrich/doi';

describe('normalizeDoi', () => {
  it.each([
    ['10.7717/peerj.4375', '10.7717/peerj.4375'],
    ['https://doi.org/10.7717/peerj.4375', '10.7717/peerj.4375'],
    ['http://dx.doi.org/10.18910/57477', '10.18910/57477'],
    ['DOI:10.1007/978-3-032-02042-0_31', '10.1007/978-3-032-02042-0_31'],
    ['10.1234/MiXeD.Case', '10.1234/mixed.case'],
    ['not-a-doi', null],
    ['10.12/too-short-prefix', null],
    ['', null],
  ])('%s → %s', (input, expected) => {
    expect(normalizeDoi(input)).toBe(expected);
  });
});

describe('dedupeDois', () => {
  it('正規化して重複除去する', () => {
    expect(
      dedupeDois(['10.1234/a', 'https://doi.org/10.1234/A', 'bad', '10.5678/b']),
    ).toEqual(['10.1234/a', '10.5678/b']);
  });
});
