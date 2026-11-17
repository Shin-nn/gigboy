/**
 * Dialect-neutral schema entry point. Every query in the server imports tables from here; the
 * actual table objects come from schema.pg.ts or schema.sqlite.ts depending on DATABASE_URL (see
 * dialect.ts). Both are exposed under the Postgres types — the two schemas have identical column
 * names and JS value types (Date, number, boolean, parsed JSON), so drizzle's query builder is
 * used the same way against either backend.
 */
import * as pg from './schema.pg.js';
import * as sqlite from './schema.sqlite.js';
import { resolveDialect } from './dialect.js';

const active = (resolveDialect() === 'sqlite' ? sqlite : pg) as unknown as typeof pg;

export const users = active.users;
export const sessions = active.sessions;
export const bands = active.bands;
export const bandMembers = active.bandMembers;
export const bandInvites = active.bandInvites;
export const userInvites = active.userInvites;
export const songs = active.songs;
export const songMemberPrefs = active.songMemberPrefs;
export const songRevisions = active.songRevisions;
export const songLists = active.songLists;
export const setlists = active.setlists;
export const tours = active.tours;
export const gigs = active.gigs;
export const calendarFeeds = active.calendarFeeds;
export const handNotes = active.handNotes;
export const songRecordings = active.songRecordings;
export const bandChordVoicings = active.bandChordVoicings;
export const recordingComments = active.recordingComments;
export const attachments = active.attachments;
export const trashItems = active.trashItems;
export const setlistSessions = active.setlistSessions;
export const bandRiders = active.bandRiders;
export const pressKits = active.pressKits;
export const pressKitImages = active.pressKitImages;
export const pressKitShares = active.pressKitShares;
export const bandLogos = active.bandLogos;
export const feedback = active.feedback;
export const apiTokens = active.apiTokens;
