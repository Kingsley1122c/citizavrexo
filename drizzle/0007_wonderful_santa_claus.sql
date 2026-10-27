CREATE TABLE `card_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`label` text NOT NULL,
	`monthly_limit_minor` integer NOT NULL,
	`status` text NOT NULL,
	`card_id` text,
	`rejection_reason` text,
	`submitted_at` text NOT NULL,
	`reviewed_by` text,
	`reviewed_at` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
ALTER TABLE `users` ADD `deleted_at` text;