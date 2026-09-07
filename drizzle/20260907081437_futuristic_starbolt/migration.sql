CREATE TABLE `rooms` (
	`code` text PRIMARY KEY,
	`building` text NOT NULL,
	`floor` integer,
	`room_name` text NOT NULL,
	`capacity` integer DEFAULT 40,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `bookings` ADD `booking_type` text DEFAULT 'adhoc' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `fakultas` text;--> statement-breakpoint
ALTER TABLE `users` ADD `prodi` text;--> statement-breakpoint
ALTER TABLE `users` ADD `semester` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `no_telp` text NOT NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`jid` text PRIMARY KEY,
	`nama` text NOT NULL,
	`fakultas` text,
	`prodi` text,
	`semester` integer,
	`kelas` text NOT NULL,
	`no_telp` text NOT NULL,
	`role` text DEFAULT 'korti' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_users`(`jid`, `nama`, `kelas`, `role`, `created_at`) SELECT `jid`, `nama`, `kelas`, `role`, `created_at` FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_bookings` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`room_code` text NOT NULL,
	`booking_date` text NOT NULL,
	`slot_code` text NOT NULL,
	`user_jid` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`booking_type` text DEFAULT 'adhoc' NOT NULL,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT `fk_bookings_room_code_rooms_code_fk` FOREIGN KEY (`room_code`) REFERENCES `rooms`(`code`) ON DELETE CASCADE,
	CONSTRAINT `fk_bookings_user_jid_users_jid_fk` FOREIGN KEY (`user_jid`) REFERENCES `users`(`jid`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_bookings`(`id`, `room_code`, `booking_date`, `slot_code`, `user_jid`, `status`, `notes`, `created_at`) SELECT `id`, `room_code`, `booking_date`, `slot_code`, `user_jid`, `status`, `notes`, `created_at` FROM `bookings`;--> statement-breakpoint
DROP TABLE `bookings`;--> statement-breakpoint
ALTER TABLE `__new_bookings` RENAME TO `bookings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_force_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`event_name` text NOT NULL,
	`room_code` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`slot_code` text,
	`created_by_jid` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT `fk_force_events_room_code_rooms_code_fk` FOREIGN KEY (`room_code`) REFERENCES `rooms`(`code`) ON DELETE CASCADE,
	CONSTRAINT `fk_force_events_created_by_jid_users_jid_fk` FOREIGN KEY (`created_by_jid`) REFERENCES `users`(`jid`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_force_events`(`id`, `event_name`, `room_code`, `start_date`, `end_date`, `slot_code`, `created_by_jid`, `status`, `created_at`) SELECT `id`, `event_name`, `room_code`, `start_date`, `end_date`, `slot_code`, `created_by_jid`, `status`, `created_at` FROM `force_events`;--> statement-breakpoint
DROP TABLE `force_events`;--> statement-breakpoint
ALTER TABLE `__new_force_events` RENAME TO `force_events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_bookings_unique_active_slot` ON `bookings` (`room_code`,`booking_date`,`slot_code`,`status`);--> statement-breakpoint
CREATE INDEX `idx_bookings_date_room` ON `bookings` (`booking_date`,`room_code`);--> statement-breakpoint
CREATE INDEX `idx_bookings_user` ON `bookings` (`user_jid`);--> statement-breakpoint
CREATE INDEX `idx_force_events_rooms_date` ON `force_events` (`room_code`,`start_date`,`end_date`);--> statement-breakpoint
CREATE INDEX `idx_force_events_creator` ON `force_events` (`created_by_jid`);