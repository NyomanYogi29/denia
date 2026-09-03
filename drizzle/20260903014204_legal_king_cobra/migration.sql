CREATE TABLE `bookings` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`room_code` text NOT NULL,
	`booking_date` text NOT NULL,
	`slot_code` text NOT NULL,
	`user_jid` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT `fk_bookings_user_jid_users_jid_fk` FOREIGN KEY (`user_jid`) REFERENCES `users`(`jid`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `force_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`event_name` text NOT NULL,
	`room_code` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`slot_code` text,
	`created_by_jid` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT `fk_force_events_created_by_jid_users_jid_fk` FOREIGN KEY (`created_by_jid`) REFERENCES `users`(`jid`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`jid` text PRIMARY KEY,
	`nama` text NOT NULL,
	`nim` text NOT NULL UNIQUE,
	`kelas` text NOT NULL,
	`role` text DEFAULT 'korti' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_bookings_unique_active_slot` ON `bookings` (`room_code`,`booking_date`,`slot_code`,`status`);--> statement-breakpoint
CREATE INDEX `idx_bookings_date_room` ON `bookings` (`booking_date`,`room_code`);--> statement-breakpoint
CREATE INDEX `idx_bookings_user` ON `bookings` (`user_jid`);--> statement-breakpoint
CREATE INDEX `idx_force_events_rooms_date` ON `force_events` (`room_code`,`start_date`,`end_date`);