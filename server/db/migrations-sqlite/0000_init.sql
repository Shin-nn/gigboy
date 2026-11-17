CREATE TABLE `api_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`token_prefix` text NOT NULL,
	`last_used_at` integer,
	`expires_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_tokens_token_hash_unique` ON `api_tokens` (`token_hash`);--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`song_id` text NOT NULL,
	`name` text NOT NULL,
	`storage_key` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`mime_type` text DEFAULT 'application/pdf' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`uploader_user_id` text,
	`uploader_display_name` text,
	`uploader_avatar` text,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploader_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `band_chord_voicings` (
	`id` text PRIMARY KEY NOT NULL,
	`band_id` text NOT NULL,
	`instrument` text NOT NULL,
	`chord_name` text NOT NULL,
	`frets` text NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`band_id`) REFERENCES `bands`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "band_chord_voicings_instrument_check" CHECK("band_chord_voicings"."instrument" in ('guitar', 'ukulele'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `band_chord_voicings_band_instrument_chord_unique` ON `band_chord_voicings` (`band_id`,`instrument`,`chord_name`);--> statement-breakpoint
CREATE TABLE `band_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`band_id` text NOT NULL,
	`inviter_id` text NOT NULL,
	`role` text DEFAULT 'editor' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`band_id`) REFERENCES `bands`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inviter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "band_invites_status_check" CHECK("band_invites"."status" in ('pending', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE `band_logos` (
	`id` text PRIMARY KEY NOT NULL,
	`band_id` text NOT NULL,
	`storage_key` text NOT NULL,
	`thumb_storage_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`thumb_size_bytes` integer NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`created_by` text,
	FOREIGN KEY (`band_id`) REFERENCES `bands`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `band_members` (
	`band_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'editor' NOT NULL,
	`joined_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	PRIMARY KEY(`band_id`, `user_id`),
	FOREIGN KEY (`band_id`) REFERENCES `bands`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "band_members_role_check" CHECK("band_members"."role" in ('editor', 'viewer'))
);
--> statement-breakpoint
CREATE TABLE `band_riders` (
	`id` text PRIMARY KEY NOT NULL,
	`band_id` text NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`hospitality_notes` text,
	`logistics_notes` text,
	`items` text DEFAULT ('[]') NOT NULL,
	`drawing_layers` text DEFAULT ('[]') NOT NULL,
	`public_share_enabled` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`band_id`) REFERENCES `bands`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `bands` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`icon` text,
	`logo` text,
	`owner_id` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `calendar_feeds` (
	`token` text PRIMARY KEY NOT NULL,
	`band_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`band_id`) REFERENCES `bands`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "calendar_feeds_status_check" CHECK("calendar_feeds"."status" in ('active', 'revoked'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_feeds_one_active_idx` ON `calendar_feeds` (`band_id`,`user_id`) WHERE "calendar_feeds"."status" = 'active';--> statement-breakpoint
CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`email` text,
	`message` text NOT NULL,
	`page` text,
	`user_agent` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `gigs` (
	`id` text PRIMARY KEY NOT NULL,
	`band_id` text NOT NULL,
	`tour_id` text,
	`title` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer,
	`get_in_at` integer,
	`sound_check_at` integer,
	`timezone` text,
	`venue` text,
	`address` text,
	`contact_name` text,
	`contact_phone` text,
	`contact_email` text,
	`notes` text,
	`setlist_id` text,
	`press_kit_id` text,
	`rider_id` text,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`band_id`) REFERENCES `bands`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tour_id`) REFERENCES `tours`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`setlist_id`) REFERENCES `setlists`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`press_kit_id`) REFERENCES `press_kits`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`rider_id`) REFERENCES `band_riders`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "gigs_status_check" CHECK("gigs"."status" in ('confirmed', 'tentative', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE `hand_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`song_id` text NOT NULL,
	`band_id` text NOT NULL,
	`author_user_id` text NOT NULL,
	`author_name` text,
	`author_avatar` text,
	`strokes` text DEFAULT ('[]') NOT NULL,
	`text_notes` text,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`band_id`) REFERENCES `bands`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hand_notes_song_author_unique` ON `hand_notes` (`song_id`,`author_user_id`);--> statement-breakpoint
CREATE TABLE `press_kit_images` (
	`id` text PRIMARY KEY NOT NULL,
	`band_id` text NOT NULL,
	`title` text NOT NULL,
	`storage_key` text NOT NULL,
	`thumb_storage_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`thumb_size_bytes` integer NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`created_by` text,
	FOREIGN KEY (`band_id`) REFERENCES `bands`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `press_kit_shares` (
	`token` text PRIMARY KEY NOT NULL,
	`band_id` text NOT NULL,
	`kit_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`band_id`) REFERENCES `bands`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`kit_id`) REFERENCES `press_kits`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "press_kit_shares_status_check" CHECK("press_kit_shares"."status" in ('active', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE `press_kits` (
	`id` text PRIMARY KEY NOT NULL,
	`band_id` text NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`rich_text` text DEFAULT '' NOT NULL,
	`image_ids` text DEFAULT ('[]') NOT NULL,
	`video_urls` text DEFAULT ('[]') NOT NULL,
	`selected_video_urls` text DEFAULT ('[]') NOT NULL,
	`presave_release_name` text,
	`presave_release_date` text,
	`presave_urls` text DEFAULT ('[]') NOT NULL,
	`selected_presave_urls` text DEFAULT ('[]') NOT NULL,
	`gig_ids` text DEFAULT ('[]') NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`created_by` text,
	FOREIGN KEY (`band_id`) REFERENCES `bands`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `recording_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`recording_id` text NOT NULL,
	`song_id` text NOT NULL,
	`band_id` text NOT NULL,
	`author_user_id` text,
	`author_display_name` text,
	`author_avatar` text,
	`at_ms` integer,
	`body` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`recording_id`) REFERENCES `song_recordings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`band_id`) REFERENCES `bands`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `setlist_sessions` (
	`setlist_id` text PRIMARY KEY NOT NULL,
	`band_id` text NOT NULL,
	`song_index` integer DEFAULT 0 NOT NULL,
	`page_index` integer DEFAULT 0 NOT NULL,
	`transpose` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`setlist_id`) REFERENCES `setlists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`band_id`) REFERENCES `bands`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `setlists` (
	`id` text PRIMARY KEY NOT NULL,
	`band_id` text NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`song_ids` text DEFAULT ('[]') NOT NULL,
	`song_notes` text,
	`sort_order` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`band_id`) REFERENCES `bands`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `song_lists` (
	`id` text PRIMARY KEY NOT NULL,
	`band_id` text NOT NULL,
	`name` text NOT NULL,
	`song_ids` text DEFAULT ('[]') NOT NULL,
	`folder_id` text,
	`icon` text,
	`sort_order` integer,
	FOREIGN KEY (`band_id`) REFERENCES `bands`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `song_member_prefs` (
	`song_id` text NOT NULL,
	`user_id` text NOT NULL,
	`band_id` text NOT NULL,
	`transpose` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	PRIMARY KEY(`song_id`, `user_id`),
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`band_id`) REFERENCES `bands`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `song_recordings` (
	`id` text PRIMARY KEY NOT NULL,
	`song_id` text NOT NULL,
	`band_id` text NOT NULL,
	`name` text NOT NULL,
	`storage_key` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`mime_type` text NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`waveform_bars` text,
	`recorder_user_id` text,
	`recorder_display_name` text,
	`recorder_avatar` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`band_id`) REFERENCES `bands`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recorder_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `song_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`song_id` text NOT NULL,
	`band_id` text NOT NULL,
	`editor_user_id` text,
	`editor_display_name` text,
	`editor_avatar` text,
	`snapshot` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`band_id`) REFERENCES `bands`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`editor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `songs` (
	`id` text PRIMARY KEY NOT NULL,
	`band_id` text NOT NULL,
	`title` text NOT NULL,
	`artist` text,
	`author` text,
	`playback_url` text,
	`language` text NOT NULL,
	`secondary_languages` text,
	`tags` text,
	`chordpro` text NOT NULL,
	`capo` integer,
	`key` text,
	`preferred_transpose` integer,
	`tempo` integer,
	`time_signature` text,
	`sort_order` integer,
	`date` text,
	`duration_seconds` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`band_id`) REFERENCES `bands`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tours` (
	`id` text PRIMARY KEY NOT NULL,
	`band_id` text NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`sort_order` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`band_id`) REFERENCES `bands`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `trash_items` (
	`id` text PRIMARY KEY NOT NULL,
	`band_id` text NOT NULL,
	`item_type` text NOT NULL,
	`payload` text NOT NULL,
	`deleted_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`purge_at` integer NOT NULL,
	FOREIGN KEY (`band_id`) REFERENCES `bands`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`inviter_id` text NOT NULL,
	`email` text,
	`role` text DEFAULT 'member' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_user_id` text,
	FOREIGN KEY (`inviter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`accepted_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "user_invites_status_check" CHECK("user_invites"."status" in ('pending', 'revoked', 'accepted'))
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`email_lower` text NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`avatar` text,
	`full_name` text,
	`role` text DEFAULT 'member' NOT NULL,
	`storage_quota_bytes` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	CONSTRAINT "users_role_check" CHECK("users"."role" in ('member', 'admin'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_lower_unique` ON `users` (`email_lower`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);