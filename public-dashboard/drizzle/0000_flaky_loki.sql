CREATE TABLE `radar_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `radar_locks` (
	`key` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `signal_events` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`side` text NOT NULL,
	`price` text NOT NULL,
	`reason` text NOT NULL,
	`bar_time` text NOT NULL,
	`created_at` integer NOT NULL
);
