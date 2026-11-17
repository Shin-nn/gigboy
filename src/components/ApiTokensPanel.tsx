import { FormEvent, useEffect, useState } from 'react';
import { Bot, Copy, KeyRound, Trash2 } from 'lucide-react';
import toast from '../utils/anchoredToast';
import { dataClient } from '../lib/dataClient';
import type { ApiToken } from '../lib/dataClient/types';

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString() : 'never';
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Copied.');
  } catch {
    toast.error('Could not copy — select the text and copy it manually.');
  }
}

/**
 * Profile section for personal API tokens, which connect AI assistants (Claude and other MCP
 * clients) to this Gigboy's `/mcp` endpoint. A token acts as the user, with their band roles.
 */
export default function ApiTokensPanel() {
  const [tokens, setTokens] = useState<ApiToken[] | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);

  const mcpUrl = `${window.location.origin}/mcp`;

  useEffect(() => {
    dataClient.apiTokens
      .list()
      .then(setTokens)
      .catch((err: Error) => {
        setTokens([]);
        toast.error(err.message);
      });
  }, []);

  const onCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Give the token a name, e.g. "Claude on my laptop".');
      return;
    }
    setBusy(true);
    try {
      const { token, apiToken } = await dataClient.apiTokens.create({ name: trimmed });
      setTokens((prev) => [apiToken, ...(prev ?? [])]);
      setRevealed(token);
      setName('');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onRevoke = async (token: ApiToken) => {
    if (!window.confirm(`Revoke "${token.name}"? Anything using it will lose access immediately.`)) return;
    try {
      await dataClient.apiTokens.revoke(token.id);
      setTokens((prev) => (prev ?? []).filter((t) => t.id !== token.id));
      toast.success('Token revoked.');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const claudeCommand = revealed
    ? `claude mcp add --transport http gigboy ${mcpUrl} --header "Authorization: Bearer ${revealed}"`
    : '';

  return (
    <section className="profile-settings-card profile-settings-card--wide">
      <div className="profile-section-heading">
        <div>
          <h2><Bot size={18} aria-hidden="true" /> AI assistants (MCP)</h2>
          <p className="profile-settings-muted">
            Let Claude or another MCP client read and edit your bands' songs, setlists, gigs, riders and press kits.
            A token acts as you, with your role in each band — keep it secret and revoke it when you stop using it.
          </p>
        </div>
      </div>

      <div className="api-tokens-endpoint">
        <span className="profile-settings-muted">MCP server URL</span>
        <code>{mcpUrl}</code>
        <button type="button" className="btn btn--ghost" onClick={() => { void copy(mcpUrl); }} aria-label="Copy MCP URL">
          <Copy size={14} />
        </button>
      </div>

      <form className="profile-settings-form profile-settings-form--inline" onSubmit={onCreate}>
        <label className="form-field">
          <span>New token name</span>
          <input
            type="text"
            value={name}
            maxLength={100}
            placeholder="Claude on my laptop"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button type="submit" className="btn btn--primary profile-settings-save-btn" disabled={busy}>
          <KeyRound size={16} /> {busy ? 'Creating…' : 'Create token'}
        </button>
      </form>

      {revealed && (
        <div className="api-tokens-reveal" role="status">
          <p><strong>Copy this token now — it won't be shown again.</strong></p>
          <div className="api-tokens-secret">
            <code>{revealed}</code>
            <button type="button" className="btn btn--secondary" onClick={() => { void copy(revealed); }}>
              <Copy size={14} /> Copy
            </button>
          </div>
          <p className="profile-settings-muted">
            Claude Code: run this in a terminal. Other clients: add an HTTP MCP server with the URL above and the header{' '}
            <code>Authorization: Bearer &lt;token&gt;</code>.
          </p>
          <div className="api-tokens-secret">
            <code>{claudeCommand}</code>
            <button type="button" className="btn btn--secondary" onClick={() => { void copy(claudeCommand); }}>
              <Copy size={14} /> Copy
            </button>
          </div>
          <button type="button" className="btn btn--ghost" onClick={() => setRevealed(null)}>Done</button>
        </div>
      )}

      {tokens === null ? (
        <p className="profile-settings-muted">Loading tokens…</p>
      ) : tokens.length === 0 ? (
        <p className="profile-settings-muted">No tokens yet.</p>
      ) : (
        <ul className="api-tokens-list">
          {tokens.map((t) => (
            <li key={t.id}>
              <div>
                <strong>{t.name}</strong> <code>{t.tokenPrefix}…</code>
                <div className="profile-settings-muted">
                  Created {formatDate(t.createdAt)} · last used {formatDate(t.lastUsedAt)}
                  {t.expiresAt ? ` · expires ${formatDate(t.expiresAt)}` : ''}
                </div>
              </div>
              <button type="button" className="btn btn--ghost" onClick={() => { void onRevoke(t); }} aria-label={`Revoke ${t.name}`}>
                <Trash2 size={16} /> Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
