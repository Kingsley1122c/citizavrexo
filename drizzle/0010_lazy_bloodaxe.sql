CREATE TABLE `bank_destinations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`label` text NOT NULL,
	`bank_name` text NOT NULL,
	`account_name` text NOT NULL,
	`account_number` text NOT NULL,
	`currency` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_destinations_owner_account_unique` ON `bank_destinations` (`user_id`,`bank_name`,`account_number`,`currency`);--> statement-breakpoint
ALTER TABLE `users` ADD `profile_image_key` text;--> statement-breakpoint
ALTER TABLE `users` ADD `profile_image_updated_at` text;--> statement-breakpoint
ALTER TABLE `withdrawal_requests` ADD `destination_id` text REFERENCES bank_destinations(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `withdrawal_requests` ADD `destination_bank_name` text;--> statement-breakpoint
ALTER TABLE `withdrawal_requests` ADD `destination_account_name` text;--> statement-breakpoint
ALTER TABLE `withdrawal_requests` ADD `destination_account_number` text;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`number` text NOT NULL,
	`type` text NOT NULL,
	`currency` text NOT NULL,
	`balance_minor` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "accounts_number_ten_digits" CHECK(length("__new_accounts"."number") = 10 AND "__new_accounts"."number" NOT GLOB '*[^0-9]*')
);
--> statement-breakpoint
INSERT INTO `__new_accounts`("id", "user_id", "name", "number", "type", "currency", "balance_minor", "status", "created_at", "updated_at") SELECT "id", "user_id", "name", printf('%010d', 8000000000 + ((row_number() OVER (ORDER BY "created_at", "id") * 2654435761) % 1000000000)), "type", "currency", "balance_minor", "status", "created_at", "updated_at" FROM `accounts`;--> statement-breakpoint
DROP TABLE `accounts`;--> statement-breakpoint
ALTER TABLE `__new_accounts` RENAME TO `accounts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_number_unique` ON `accounts` (`number`);