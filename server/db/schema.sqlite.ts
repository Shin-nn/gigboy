/**
 * SQLite mirror of schema.pg.ts — same tables, columns and constraints, mapped to SQLite types:
 * timestamps are epoch-millisecond integers, jsonb is JSON text, booleans are 0/1 integers.
 * schema.pg.ts is canonical (and documents every table); keep this file in lockstep with it and
 * regenerate migrations-sqlite/ with DATABASE_URL=file:… npm run db:generate after a change.
 */
import { sqliteTable, text, integer, primaryKey, check, unique, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

const ts = (name: string) => integer(name, { mode: 'timestamp_ms' });
const json = (name: string) => text(name, { mode: 'json' });
/** Current time as epoch milliseconds, matching ts() columns. */
const NOW = sql`(cast((julianday('now') - 2440587.5) * 86400000 as integer))`;
const EMPTY_JSON_ARRAY = sql`('[]')`;

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull().unique(),
    emailLower: text('email_lower').notNull().unique(),
    username: text('username').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    avatar: text('avatar'),
    fullName: text('full_name'),
    role: text('role').notNull().default('member'),
    storageQuotaBytes: integer('storage_quota_bytes'),
    createdAt: ts('created_at').notNull().default(NOW),
  },
  (table) => ({ users_role_check: check('users_role_check', sql`${table.role} in ('member', 'admin')`) }),
);

export const sessions = sqliteTable('sessions', {
  token: text('token').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: ts('expires_at').notNull(),
  createdAt: ts('created_at').notNull().default(NOW),
});

export const bands = sqliteTable('bands', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  icon: text('icon'),
  logo: text('logo'),
  ownerId: text('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: ts('created_at').notNull().default(NOW),
  updatedAt: ts('updated_at').notNull().default(NOW),
});

export const bandMembers = sqliteTable(
  'band_members',
  {
    bandId: text('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('editor'),
    joinedAt: ts('joined_at').notNull().default(NOW),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.bandId, table.userId] }),
    band_members_role_check: check('band_members_role_check', sql`${table.role} in ('editor', 'viewer')`),
  }),
);

export const bandInvites = sqliteTable('band_invites', {
  id: text('id').primaryKey(),
  bandId: text('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
  inviterId: text('inviter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('editor'),
  status: text('status').notNull().default('pending'),
  createdAt: ts('created_at').notNull().default(NOW),
  expiresAt: ts('expires_at').notNull(),
}, (table) => ({
  band_invites_status_check: check('band_invites_status_check', sql`${table.status} in ('pending', 'revoked')`),
}));

export const userInvites = sqliteTable('user_invites', {
  id: text('id').primaryKey(),
  inviterId: text('inviter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  email: text('email'),
  role: text('role').notNull().default('member'),
  status: text('status').notNull().default('pending'),
  createdAt: ts('created_at').notNull().default(NOW),
  expiresAt: ts('expires_at').notNull(),
  acceptedUserId: text('accepted_user_id').references(() => users.id, { onDelete: 'set null' }),
}, (table) => ({
  user_invites_status_check: check('user_invites_status_check', sql`${table.status} in ('pending', 'revoked', 'accepted')`),
}));

export const songs = sqliteTable(
  'songs',
  {
    id: text('id').primaryKey(),
    bandId: text('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    artist: text('artist'),
    author: text('author'),
    playbackUrl: text('playback_url'),
    language: text('language').notNull(),
    secondaryLanguages: json('secondary_languages').$type<string[]>(),
    tags: json('tags').$type<string[]>(),
    chordpro: text('chordpro').notNull(),
    capo: integer('capo'),
    key: text('key'),
    preferredTranspose: integer('preferred_transpose'),
    tempo: integer('tempo'),
    timeSignature: text('time_signature'),
    sortOrder: integer('sort_order'),
        date: text('date'),
        durationSeconds: integer('duration_seconds'),
    createdAt: ts('created_at').notNull().default(NOW),
    updatedAt: ts('updated_at').notNull().default(NOW),
  },
);

export const songMemberPrefs = sqliteTable(
  'song_member_prefs',
  {
    songId: text('song_id').notNull().references(() => songs.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    bandId: text('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
    transpose: integer('transpose').notNull().default(0),
    updatedAt: ts('updated_at').notNull().default(NOW),
  },
  (table) => ({ pk: primaryKey({ columns: [table.songId, table.userId] }) }),
);

export const songRevisions = sqliteTable(
  'song_revisions',
  {
    id: text('id').primaryKey(),
    songId: text('song_id').notNull().references(() => songs.id, { onDelete: 'cascade' }),
    bandId: text('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
    editorUserId: text('editor_user_id').references(() => users.id, { onDelete: 'set null' }),
    editorDisplayName: text('editor_display_name'),
    editorAvatar: text('editor_avatar'),
    snapshot: json('snapshot').$type<Record<string, unknown>>().notNull(),
    createdAt: ts('created_at').notNull().default(NOW),
  },
);

export const songLists = sqliteTable(
  'song_lists',
  {
    id: text('id').primaryKey(),
    bandId: text('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    songIds: json('song_ids').$type<string[]>().notNull().default(EMPTY_JSON_ARRAY),
    folderId: text('folder_id'),
    icon: text('icon'),
    sortOrder: integer('sort_order'),
  },
);

export const setlists = sqliteTable(
  'setlists',
  {
    id: text('id').primaryKey(),
    bandId: text('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    icon: text('icon'),
    songIds: json('song_ids').$type<string[]>().notNull().default(EMPTY_JSON_ARRAY),
    songNotes: json('song_notes').$type<Record<string, string>>(),
    sortOrder: integer('sort_order'),
    createdAt: ts('created_at').notNull().default(NOW),
    updatedAt: ts('updated_at').notNull().default(NOW),
  },
);

export const tours = sqliteTable('tours', {
  id: text('id').primaryKey(),
  bandId: text('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  icon: text('icon'),
  sortOrder: integer('sort_order'),
  createdAt: ts('created_at').notNull().default(NOW),
  updatedAt: ts('updated_at').notNull().default(NOW),
});

export const gigs = sqliteTable(
  'gigs',
  {
    id: text('id').primaryKey(),
    bandId: text('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
        tourId: text('tour_id').references(() => tours.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
        startsAt: ts('starts_at').notNull(),
    endsAt: ts('ends_at'),
        getInAt: ts('get_in_at'),
    soundCheckAt: ts('sound_check_at'),
        timezone: text('timezone'),
    venue: text('venue'),
    address: text('address'),
        contactName: text('contact_name'),
    contactPhone: text('contact_phone'),
    contactEmail: text('contact_email'),
    notes: text('notes'),
        setlistId: text('setlist_id').references(() => setlists.id, { onDelete: 'set null' }),
    pressKitId: text('press_kit_id').references(() => pressKits.id, { onDelete: 'set null' }),
    riderId: text('rider_id').references(() => bandRiders.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('confirmed'),
    createdAt: ts('created_at').notNull().default(NOW),
    updatedAt: ts('updated_at').notNull().default(NOW),
  },
  (table) => ({ gigs_status_check: check('gigs_status_check', sql`${table.status} in ('confirmed', 'tentative', 'cancelled')`) }),
);

export const calendarFeeds = sqliteTable(
  'calendar_feeds',
  {
    token: text('token').primaryKey(),
    bandId: text('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('active'),
    createdAt: ts('created_at').notNull().default(NOW),
  },
  (table) => ({
    calendar_feeds_status_check: check('calendar_feeds_status_check', sql`${table.status} in ('active', 'revoked')`),
    calendar_feeds_one_active_idx: uniqueIndex('calendar_feeds_one_active_idx').on(table.bandId, table.userId).where(sql`${table.status} = 'active'`),
  }),
);

export const handNotes = sqliteTable(
  'hand_notes',
  {
    id: text('id').primaryKey(),
    songId: text('song_id').notNull().references(() => songs.id, { onDelete: 'cascade' }),
    bandId: text('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
    authorUserId: text('author_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    authorName: text('author_name'),
    authorAvatar: text('author_avatar'),
    strokes: json('strokes').$type<unknown[]>().notNull().default(EMPTY_JSON_ARRAY),
    textNotes: json('text_notes').$type<unknown[]>(),
    updatedAt: ts('updated_at').notNull().default(NOW),
  },
  (table) => ({
    hand_notes_song_author_unique: unique('hand_notes_song_author_unique').on(table.songId, table.authorUserId),
  }),
);

export const songRecordings = sqliteTable(
  'song_recordings',
  {
    id: text('id').primaryKey(),
    songId: text('song_id').notNull().references(() => songs.id, { onDelete: 'cascade' }),
    bandId: text('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    storageKey: text('storage_key').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    mimeType: text('mime_type').notNull(),
    durationMs: integer('duration_ms').notNull().default(0),
    waveformBars: json('waveform_bars').$type<number[]>(),
    recorderUserId: text('recorder_user_id').references(() => users.id, { onDelete: 'set null' }),
    recorderDisplayName: text('recorder_display_name'),
    recorderAvatar: text('recorder_avatar'),
    createdAt: ts('created_at').notNull().default(NOW),
  },
);

export const bandChordVoicings = sqliteTable(
  'band_chord_voicings',
  {
    id: text('id').primaryKey(),
    bandId: text('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
    instrument: text('instrument').notNull(),
    chordName: text('chord_name').notNull(),
    frets: json('frets').$type<number[]>().notNull(),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: ts('updated_at').notNull().default(NOW),
  },
  (table) => ({
    band_chord_voicings_band_instrument_chord_unique: unique('band_chord_voicings_band_instrument_chord_unique').on(table.bandId, table.instrument, table.chordName),
    band_chord_voicings_instrument_check: check('band_chord_voicings_instrument_check', sql`${table.instrument} in ('guitar', 'ukulele')`),
  }),
);

export const recordingComments = sqliteTable(
  'recording_comments',
  {
    id: text('id').primaryKey(),
    recordingId: text('recording_id').notNull().references(() => songRecordings.id, { onDelete: 'cascade' }),
    songId: text('song_id').notNull().references(() => songs.id, { onDelete: 'cascade' }),
    bandId: text('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
    authorUserId: text('author_user_id').references(() => users.id, { onDelete: 'set null' }),
    authorDisplayName: text('author_display_name'),
    authorAvatar: text('author_avatar'),
    atMs: integer('at_ms'),
    body: text('body').notNull(),
    createdAt: ts('created_at').notNull().default(NOW),
    updatedAt: ts('updated_at').notNull().default(NOW),
  },
);

export const attachments = sqliteTable('attachments', {
  id: text('id').primaryKey(),
  songId: text('song_id').notNull().references(() => songs.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  storageKey: text('storage_key').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  mimeType: text('mime_type').notNull().default('application/pdf'),
  createdAt: ts('created_at').notNull().default(NOW),
  uploaderUserId: text('uploader_user_id').references(() => users.id, { onDelete: 'set null' }),
  uploaderDisplayName: text('uploader_display_name'),
  uploaderAvatar: text('uploader_avatar'),
});

export const trashItems = sqliteTable(
  'trash_items',
  {
    id: text('id').primaryKey(),
    bandId: text('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
    itemType: text('item_type').notNull(),
    payload: json('payload').notNull(),
    deletedAt: ts('deleted_at').notNull().default(NOW),
    purgeAt: ts('purge_at').notNull(),
  },
);

export const setlistSessions = sqliteTable('setlist_sessions', {
  setlistId: text('setlist_id').primaryKey().references(() => setlists.id, { onDelete: 'cascade' }),
  bandId: text('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
  songIndex: integer('song_index').notNull().default(0),
  pageIndex: integer('page_index').notNull().default(0),
  transpose: integer('transpose').notNull().default(0),
  updatedAt: ts('updated_at').notNull().default(NOW),
});

export const bandRiders = sqliteTable('band_riders', {
  id: text('id').primaryKey(),
  bandId: text('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  icon: text('icon'),
  hospitalityNotes: text('hospitality_notes'),
  logisticsNotes: text('logistics_notes'),
  items: json('items').$type<unknown[]>().notNull().default(EMPTY_JSON_ARRAY),
  drawingLayers: json('drawing_layers').$type<unknown[]>().notNull().default(EMPTY_JSON_ARRAY),
  publicShareEnabled: integer('public_share_enabled', { mode: 'boolean' }).notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: ts('created_at').notNull().default(NOW),
  updatedAt: ts('updated_at').notNull().default(NOW),
});

export const pressKits = sqliteTable('press_kits', {
  id: text('id').primaryKey(),
  bandId: text('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  icon: text('icon'),
  richText: text('rich_text').notNull().default(''),
  imageIds: json('image_ids').$type<string[]>().notNull().default(EMPTY_JSON_ARRAY),
  videoUrls: json('video_urls').$type<string[]>().notNull().default(EMPTY_JSON_ARRAY),
  selectedVideoUrls: json('selected_video_urls').$type<string[]>().notNull().default(EMPTY_JSON_ARRAY),
  presaveReleaseName: text('presave_release_name'),
  presaveReleaseDate: text('presave_release_date'),
  presaveUrls: json('presave_urls').$type<string[]>().notNull().default(EMPTY_JSON_ARRAY),
  selectedPresaveUrls: json('selected_presave_urls').$type<string[]>().notNull().default(EMPTY_JSON_ARRAY),
  gigIds: json('gig_ids').$type<string[]>().notNull().default(EMPTY_JSON_ARRAY),
  createdAt: ts('created_at').notNull().default(NOW),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
});

export const pressKitImages = sqliteTable('press_kit_images', {
  id: text('id').primaryKey(),
  bandId: text('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  storageKey: text('storage_key').notNull(),
  thumbStorageKey: text('thumb_storage_key').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  thumbSizeBytes: integer('thumb_size_bytes').notNull(),
  createdAt: ts('created_at').notNull().default(NOW),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
});

export const pressKitShares = sqliteTable(
  'press_kit_shares',
  {
    token: text('token').primaryKey(),
    bandId: text('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
    kitId: text('kit_id').notNull().references(() => pressKits.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('active'),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().default(NOW),
  },
  (table) => ({ press_kit_shares_status_check: check('press_kit_shares_status_check', sql`${table.status} in ('active', 'revoked')`) }),
);

export const bandLogos = sqliteTable('band_logos', {
  id: text('id').primaryKey(),
  bandId: text('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
  storageKey: text('storage_key').notNull(),
  thumbStorageKey: text('thumb_storage_key').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  thumbSizeBytes: integer('thumb_size_bytes').notNull(),
  createdAt: ts('created_at').notNull().default(NOW),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
});

export const feedback = sqliteTable('feedback', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  email: text('email'),
  message: text('message').notNull(),
  page: text('page'),
  userAgent: text('user_agent'),
  createdAt: ts('created_at').notNull().default(NOW),
});

export const apiTokens = sqliteTable('api_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  tokenPrefix: text('token_prefix').notNull(),
  lastUsedAt: ts('last_used_at'),
  expiresAt: ts('expires_at'),
  createdAt: ts('created_at').notNull().default(NOW),
});
