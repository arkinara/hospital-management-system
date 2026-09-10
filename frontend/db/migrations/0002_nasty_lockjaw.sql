CREATE TABLE `appointment_lifecycle_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`appointment_id` integer NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`by_user_id` integer,
	`reason` text,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `appointments` ADD `scheduled_end` integer;--> statement-breakpoint
ALTER TABLE `appointments` ADD `notes` text;--> statement-breakpoint
ALTER TABLE `appointments` ADD `created_by` integer REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `appointments` ADD `updated_at` integer;