CREATE TABLE `user_status_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`previous_status` text NOT NULL,
	`next_status` text NOT NULL,
	`reason` text NOT NULL,
	`performed_by` text NOT NULL,
	`performed_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`performed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_status_changes_identity_unique` ON `user_status_changes` (`id`);