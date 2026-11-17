import type { ChordNotation } from '../utils/chordParser';
import { usesCzechNotation } from '../utils/czechNotation';
import { readStoredString, writeStoredString } from './safeStorage';

const NOTATIONS: ChordNotation[] = ['anglo', 'spanish', 'czech'];

function storageKey(songId: string): string {
  return `gigboy-song-notation-${songId}`;
}

/**
 * The chord-name notation to show a song in: the viewer's saved choice for that song, else the
 * notation the song is written in (Czech if it uses H chords, otherwise letters).
 */
export function readSongNotation(songId: string, chordpro: string): ChordNotation {
  const stored = readStoredString(storageKey(songId)) as ChordNotation | null;
  if (stored && NOTATIONS.includes(stored)) return stored;
  return usesCzechNotation(chordpro) ? 'czech' : 'anglo';
}

export function writeSongNotation(songId: string, notation: ChordNotation): void {
  writeStoredString(storageKey(songId), notation);
}
