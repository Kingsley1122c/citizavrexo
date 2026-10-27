CREATE TABLE `admin_credits` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`transaction_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`reason` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_credits_reference_unique` ON `admin_credits` (`reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `admin_credits_idempotency_key_unique` ON `admin_credits` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `admin_credits_transaction_unique` ON `admin_credits` (`transaction_id`);--> statement-breakpoint
CREATE TABLE `user_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`legal_name` text,
	`date_of_birth` text,
	`residential_address` text,
	`city` text,
	`state_province` text,
	`country` text,
	`postal_code` text,
	`phone_number` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `bank_destinations` ADD `country` text DEFAULT 'NG' NOT NULL;--> statement-breakpoint
ALTER TABLE `bank_destinations` ADD `destination_type` text DEFAULT 'bank_account' NOT NULL;--> statement-breakpoint
ALTER TABLE `card_requests` ADD `card_type` text DEFAULT 'physical' NOT NULL;--> statement-breakpoint
ALTER TABLE `cards` ADD `card_type` text DEFAULT 'physical' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `display_currency` text DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `suspension_reason` text;--> statement-breakpoint
ALTER TABLE `users` ADD `suspended_by` text;--> statement-breakpoint
ALTER TABLE `users` ADD `suspended_at` text;--> statement-breakpoint
DELETE FROM `notifications`
WHERE `event_reference` IS NOT NULL
AND `rowid` NOT IN (
	SELECT MIN(`rowid`) FROM `notifications`
	WHERE `event_reference` IS NOT NULL
	GROUP BY `user_id`, `event_reference`
);--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_user_event_reference_unique` ON `notifications` (`user_id`,`event_reference`);