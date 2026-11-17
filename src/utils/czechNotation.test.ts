import { describe, expect, it } from 'vitest';
import { angloChordToCzech, czechChordToAnglo, usesCzechNotation } from './czechNotation';
import { parseChordPro, transposeChord, convertChordNotation } from './chordParser';
import { normalizeChordForLookup } from './chordLookup';
import { normalizeKey } from './songFilters';

function chordsOf(text: string): string[] {
  const out: string[] = [];
  for (const line of parseChordPro(text)) {
    for (const seg of line.segments ?? []) if (seg.chord) out.push(seg.chord);
  }
  return out;
}

describe('Czech chord notation', () => {
  it('detects songs written with H chords', () => {
    expect(usesCzechNotation('[Hmi]Ahoj [G]světe')).toBe(true);
    expect(usesCzechNotation('[Bm]Hello [G]world')).toBe(false);
    expect(usesCzechNotation('[Hello] there')).toBe(false);
  });

  it('parses Czech songs into English spelling, where B means B♭', () => {
    expect(chordsOf('[Hmi]Ty [B]jsi [Ami7]můj [D/H]den')).toEqual(['Bm', 'Bb', 'Am7', 'D/B']);
  });

  it('leaves B alone in English songs but still reads Czech minors', () => {
    expect(chordsOf('[B]One [Ami]two')).toEqual(['B', 'Am']);
  });

  it('converts single chords both ways', () => {
    expect(czechChordToAnglo('Hmoll', true)).toBe('Bm');
    expect(czechChordToAnglo('Fmaj7', true)).toBe('Fmaj7');
    expect(angloChordToCzech('Bm')).toBe('Hmi');
    expect(angloChordToCzech('A#7')).toBe('B7');
    expect(angloChordToCzech('Bbmaj7/D')).toBe('Bmaj7/D');
    expect(angloChordToCzech('Cmaj7')).toBe('Cmaj7');
  });

  it('transposes and displays in Czech', () => {
    const [hmi] = chordsOf('[Hmi]x');
    expect(convertChordNotation(transposeChord(hmi, 1), 'czech')).toBe('Cmi');
    expect(convertChordNotation(transposeChord(hmi, -1), 'czech')).toBe('Bmi');
  });

  it('finds diagrams and keys for Czech names', () => {
    expect(normalizeChordForLookup('Hmi')).toBe('Bm');
    expect(normalizeChordForLookup('H7')).toBe('B7');
    expect(normalizeKey('Hmi')).toBe('Bm');
    expect(normalizeKey('H')).toBe('B');
  });
});
