import { FormEvent, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import toast from '../utils/anchoredToast';
import { useAuth } from '../context/AuthContext';
import { useBands } from '../context/BandsContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useBandChordVoicings } from '../hooks/useBandChordVoicings';
import { GuitarDiagram, UkuleleDiagram, VoicingEditor } from '../components/ChordDiagram';
import { GUITAR_CHORDS } from '../data/guitarChords';
import { UKULELE_CHORDS } from '../data/ukuleleChords';
import { normalizeChordForLookup } from '../utils/chordLookup';
import { convertChordNotation, type ChordNotation } from '../utils/chordParser';
import { CHORD_TOKEN_RE } from '../utils/chordGrammar';
import type { VoicingInstrument } from '../lib/bandChordVoicings';

const BUILT_IN: Record<VoicingInstrument, Record<string, number[]>> = {
  guitar: GUITAR_CHORDS,
  ukulele: UKULELE_CHORDS,
};
const STRING_COUNT: Record<VoicingInstrument, number> = { guitar: 6, ukulele: 4 };
const ROOT_ORDER = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];

function rootIndex(name: string): number {
  const m = name.match(/^[A-G][#b]?/);
  const idx = m ? ROOT_ORDER.indexOf(m[0]) : -1;
  return idx === -1 ? ROOT_ORDER.length : idx;
}

function compareChords(a: string, b: string): number {
  return rootIndex(a) - rootIndex(b) || a.length - b.length || a.localeCompare(b);
}

type ChordSource = 'built-in' | 'band' | 'custom';

interface ChordEntry {
  name: string;
  frets: number[];
  source: ChordSource;
}

interface EditorState {
  /** English-spelled lookup name, or null while a new chord's name is still being typed. */
  name: string | null;
  isNew: boolean;
  draftName: string;
  frets: number[];
}

function Diagram({ instrument, frets }: { instrument: VoicingInstrument; frets: number[] }) {
  return instrument === 'guitar' ? <GuitarDiagram frets={frets} /> : <UkuleleDiagram frets={frets} />;
}

/**
 * The band's chord dictionary: every built-in diagram plus the band's own voicings, for guitar
 * and ukulele. Editors can change any chord's fingering (stored as a band voicing, which then
 * shows everywhere in the band's songs), reset it to the built-in, or add chords that have no
 * built-in diagram at all.
 */
export default function BandChordsPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { bands, loading } = useBands();
  const band = bands.find((b) => b.id === id) ?? null;
  const canEdit = Boolean(band && user && band.memberRoles[user.id] === 'editor');
  const voicings = useBandChordVoicings(band?.id, canEdit);

  useDocumentTitle(band ? `${band.name} Chords` : 'Chords');

  const [instrument, setInstrument] = useState<VoicingInstrument>('guitar');
  const [notation, setNotation] = useState<ChordNotation>('anglo');
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [busy, setBusy] = useState(false);

  const entries = useMemo<ChordEntry[]>(() => {
    const builtIn = BUILT_IN[instrument];
    const byName = new Map<string, ChordEntry>(
      Object.entries(builtIn).map(([name, frets]) => [name, { name, frets, source: 'built-in' as const }]),
    );
    for (const v of voicings.voicings) {
      if (v.instrument !== instrument) continue;
      byName.set(v.chordName, { name: v.chordName, frets: v.frets, source: builtIn[v.chordName] ? 'band' : 'custom' });
    }
    return Array.from(byName.values()).sort((a, b) => compareChords(a.name, b.name));
  }, [instrument, voicings.voicings]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    const normalizedQuery = normalizeChordForLookup(query.trim()).toLowerCase();
    return entries.filter((e) => {
      const shown = convertChordNotation(e.name, notation).toLowerCase();
      return e.name.toLowerCase().startsWith(normalizedQuery) || shown.startsWith(q);
    });
  }, [entries, query, notation]);

  if (loading && !band) return <p className="bands-status">Loading band…</p>;
  if (!band) {
    return (
      <section className="bands-page">
        <p className="bands-status">Band not found.</p>
        <Link to="/bands" className="btn btn--secondary">Back to bands</Link>
      </section>
    );
  }

  const display = (name: string) => convertChordNotation(name, notation);

  const openExisting = (entry: ChordEntry) => {
    if (!canEdit) return;
    setEditor({ name: entry.name, isNew: false, draftName: entry.name, frets: [...entry.frets] });
  };

  const openNew = () => {
    setEditor({ name: null, isNew: true, draftName: '', frets: Array(STRING_COUNT[instrument]).fill(-1) });
  };

  // For a new chord, the lookup name follows what's typed; known shapes pre-fill the fingering.
  const onDraftNameChange = (draftName: string) => {
    setEditor((prev) => {
      if (!prev) return prev;
      const valid = CHORD_TOKEN_RE.test(draftName.trim());
      const name = valid ? normalizeChordForLookup(draftName.trim()) : null;
      const known = name ? entries.find((e) => e.name === name) : undefined;
      const untouched = prev.frets.every((f) => f === -1) || (prev.name && entries.some((e) => e.name === prev.name && e.frets.join() === prev.frets.join()));
      return { ...prev, draftName, name, frets: known && untouched ? [...known.frets] : prev.frets };
    });
  };

  const editingEntry = editor?.name ? entries.find((e) => e.name === editor.name) : undefined;

  const onSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor) return;
    if (!editor.name) {
      toast.error('Enter a chord name, e.g. "Hmi", "Cadd9" or "D/F#".');
      return;
    }
    if (editor.frets.every((f) => f === -1)) {
      toast.error('Set at least one string.');
      return;
    }
    setBusy(true);
    try {
      await voicings.save(instrument, editor.name, editor.frets);
      toast.success(`${display(editor.name)} saved.`);
      setEditor(null);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async () => {
    if (!editor?.name || !editingEntry) return;
    const resetting = editingEntry.source === 'band';
    if (!resetting && !window.confirm(`Delete the chord ${display(editor.name)}?`)) return;
    setBusy(true);
    try {
      await voicings.remove(instrument, editor.name);
      toast.success(resetting ? `${display(editor.name)} reset to the built-in diagram.` : `${display(editor.name)} deleted.`);
      setEditor(null);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bands-page chords-page">
      <header className="bands-header">
        <div>
          <h1>{band.name} · Chords</h1>
          <p>
            Chord diagrams used in this band's songs.
            {canEdit
              ? ' Click a chord to change its fingering, or add your own — changes apply to every song in the band.'
              : ' Only editors can change them.'}
          </p>
        </div>
      </header>

      <div className="chords-page-toolbar">
        <div className="instrument-toggle">
          {(['guitar', 'ukulele'] as const).map((i) => (
            <button
              key={i}
              type="button"
              className={`instrument-toggle-btn${instrument === i ? ' instrument-toggle-btn--active' : ''}`}
              onClick={() => { setInstrument(i); setEditor(null); }}
            >
              {i === 'guitar' ? 'Guitar' : 'Ukulele'}
            </button>
          ))}
        </div>
        <div className="instrument-toggle">
          <button
            type="button"
            className={`instrument-toggle-btn${notation === 'anglo' ? ' instrument-toggle-btn--active' : ''}`}
            onClick={() => setNotation('anglo')}
            aria-label="Use letter chord names"
          >
            C D E
          </button>
          <button
            type="button"
            className={`instrument-toggle-btn${notation === 'czech' ? ' instrument-toggle-btn--active' : ''}`}
            onClick={() => setNotation('czech')}
            aria-label="Use Czech chord names (H, B, mi)"
          >
            A H B
          </button>
        </div>
        <label className="chords-page-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={query}
            placeholder="Search chords (Am, Hmi, F#7…)"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {canEdit && (
          <button type="button" className="btn btn--primary" onClick={openNew}>
            <Plus size={16} /> Add chord
          </button>
        )}
      </div>

      {editor && (
        <form className="chords-page-editor" onSubmit={onSave}>
          <div className="chords-page-editor-preview">
            <Diagram instrument={instrument} frets={editor.frets} />
          </div>
          <div className="chords-page-editor-fields">
            {editor.isNew ? (
              <label className="form-field">
                <span>Chord name</span>
                <input
                  type="text"
                  value={editor.draftName}
                  maxLength={20}
                  autoFocus
                  placeholder="e.g. Hmi, Cadd9, D/F#"
                  onChange={(e) => onDraftNameChange(e.target.value)}
                />
                {editor.draftName.trim() && (
                  <small className="profile-settings-muted">
                    {editor.name
                      ? `Saved as ${editor.name}${display(editor.name) !== editor.name ? ` (${display(editor.name)})` : ''}`
                      : 'Not a recognised chord name.'}
                  </small>
                )}
              </label>
            ) : (
              <h2>{display(editor.name ?? '')}</h2>
            )}
            <VoicingEditor
              instrument={instrument}
              value={editor.frets}
              onChange={(frets) => setEditor((prev) => (prev ? { ...prev, frets } : prev))}
            />
            <div className="chords-page-editor-actions">
              <button type="submit" className="btn btn--primary" disabled={busy}>Save</button>
              {editingEntry && editingEntry.source !== 'built-in' && !editor.isNew && (
                <button type="button" className="btn btn--secondary" disabled={busy} onClick={() => { void onRemove(); }}>
                  {editingEntry.source === 'band' ? 'Reset to built-in' : 'Delete chord'}
                </button>
              )}
              <button type="button" className="btn btn--ghost" onClick={() => setEditor(null)}>Cancel</button>
            </div>
          </div>
        </form>
      )}

      {visible.length === 0 ? (
        <p className="bands-status">No chords match “{query}”.{canEdit ? ' Use “Add chord” to create it.' : ''}</p>
      ) : (
        <ul className="chords-page-grid">
          {visible.map((entry) => (
            <li key={entry.name}>
              <button
                type="button"
                className={`chords-page-card${editor?.name === entry.name ? ' chords-page-card--active' : ''}`}
                onClick={() => openExisting(entry)}
                disabled={!canEdit}
                aria-label={canEdit ? `Edit ${display(entry.name)}` : display(entry.name)}
              >
                <span className="chords-page-card-name">
                  {display(entry.name)}
                  {entry.source !== 'built-in' && (
                    <span className="chords-page-badge">{entry.source === 'band' ? 'Band' : 'Custom'}</span>
                  )}
                </span>
                <Diagram instrument={instrument} frets={entry.frets} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
