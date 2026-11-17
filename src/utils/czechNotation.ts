/**
 * Czech (and German) chord notation, as used in Czech songbooks:
 *
 *   English  B    Bb / A#   Bm    Am7
 *   Czech    H    B         Hmi   Ami7
 *
 * Internally every chord is kept in English ("anglo") spelling — transposition, diagram lookup
 * and band voicings all work on that. A song is treated as written in Czech notation when any of
 * its chords has an H root; in such a song a bare "B" means B♭. Without an H anywhere, "B" keeps
 * its English meaning, so English songs are never reinterpreted.
 */
import { CHORD_TOKEN_RE } from './chordGrammar';

const ROOT_RE = /^([A-H])([#b]?)(.*)$/;
const BRACKET_CHORD_RE = /\[([^\]\s]+)\]/g;

/** True when the ChordPro text uses Czech notation (some chord has an H root). */
export function usesCzechNotation(chordpro: string): boolean {
  for (const match of chordpro.matchAll(BRACKET_CHORD_RE)) {
    if (match[1].startsWith('H') && CHORD_TOKEN_RE.test(match[1])) return true;
  }
  return false;
}

function czechNoteToAnglo(letter: string, accidental: string, czechSource: boolean): string {
  if (letter === 'H') return `B${accidental}`;
  if (letter === 'B' && czechSource && !accidental) return 'Bb';
  return `${letter}${accidental}`;
}

/** Czech minor spellings ("mi", "moll") → "m"; leaves "min", "maj" and the rest alone. */
function czechSuffixToAnglo(suffix: string): string {
  if (suffix.startsWith('moll')) return `m${suffix.slice(4)}`;
  if (suffix.startsWith('mi') && !suffix.startsWith('min')) return `m${suffix.slice(2)}`;
  return suffix;
}

/**
 * Converts one chord as written in a song to English spelling. `czechSource` says whether the
 * song as a whole is in Czech notation (see usesCzechNotation), which decides what "B" means.
 * H roots and "mi"/"moll" minors are converted either way.
 */
export function czechChordToAnglo(chord: string, czechSource: boolean): string {
  const [main, bass] = chord.split('/');
  const m = main.match(ROOT_RE);
  if (!m) return chord;
  const root = czechNoteToAnglo(m[1], m[2], czechSource);
  const out = `${root}${czechSuffixToAnglo(m[3])}`;
  if (bass === undefined) return out;
  const b = bass.match(/^([A-H])([#b]?)$/);
  return b ? `${out}/${czechNoteToAnglo(b[1], b[2], czechSource)}` : `${out}/${bass}`;
}

function angloNoteToCzech(note: string): string {
  if (note === 'B') return 'H';
  if (note === 'Bb' || note === 'A#') return 'B';
  return note;
}

/** Converts an English-spelled chord to Czech display: B→H, B♭/A#→B, minor "m"→"mi". */
export function angloChordToCzech(chord: string): string {
  const [main, bass] = chord.split('/');
  const m = main.match(/^([A-G][#b]?)(.*)$/);
  if (!m) return chord;
  const suffix = m[2].startsWith('m') && !m[2].startsWith('maj') && !m[2].startsWith('min')
    ? `mi${m[2].slice(1)}`
    : m[2];
  const out = `${angloNoteToCzech(m[1])}${suffix}`;
  if (bass === undefined) return out;
  return /^[A-G][#b]?$/.test(bass) ? `${out}/${angloNoteToCzech(bass)}` : `${out}/${bass}`;
}
