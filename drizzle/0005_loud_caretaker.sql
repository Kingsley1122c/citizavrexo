CREATE TABLE `administrator_transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`initiated_by_user_id` text NOT NULL,
	`new_email` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`cancelled_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`initiated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `administrator_transfers_token_hash_unique` ON `administrator_transfers` (`token_hash`);