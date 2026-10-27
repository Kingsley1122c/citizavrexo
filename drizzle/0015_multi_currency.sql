ALTER TABLE `internal_transfers` ADD `recipient_amount_minor` integer;
--> statement-breakpoint
ALTER TABLE `internal_transfers` ADD `recipient_currency` text;
--> statement-breakpoint
ALTER TABLE `internal_transfers` ADD `exchange_rate` text;
--> statement-breakpoint
ALTER TABLE `internal_transfers` ADD `rate_date` text;
--> statement-breakpoint
ALTER TABLE `internal_transfers` ADD `rate_timestamp` text;
--> statement-breakpoint
ALTER TABLE `internal_transfers` ADD `rate_provider` text;
--> statement-breakpoint
ALTER TABLE `internal_transfers` ADD `sender_name` text;
--> statement-breakpoint
ALTER TABLE `internal_transfers` ADD `sender_account_name` text;
--> statement-breakpoint
ALTER TABLE `internal_transfers` ADD `sender_account_number` text;
--> statement-breakpoint
ALTER TABLE `internal_transfers` ADD `recipient_name` text;
--> statement-breakpoint
ALTER TABLE `internal_transfers` ADD `recipient_account_name` text;
--> statement-breakpoint
ALTER TABLE `internal_transfers` ADD `recipient_account_number` text;
--> statement-breakpoint
UPDATE `internal_transfers`
SET `recipient_amount_minor` = `amount_minor`,
    `recipient_currency` = `currency`,
    `exchange_rate` = '1',
    `rate_date` = substr(`created_at`, 1, 10),
    `rate_timestamp` = `created_at`,
    `rate_provider` = 'same_currency'
WHERE `recipient_amount_minor` IS NULL;
--> statement-breakpoint
UPDATE `internal_transfers`
SET `sender_name` = (SELECT `users`.`name` FROM `accounts` INNER JOIN `users` ON `users`.`id` = `accounts`.`user_id` WHERE `accounts`.`id` = `internal_transfers`.`sender_account_id`),
    `sender_account_name` = (SELECT `name` FROM `accounts` WHERE `id` = `internal_transfers`.`sender_account_id`),
    `sender_account_number` = (SELECT `number` FROM `accounts` WHERE `id` = `internal_transfers`.`sender_account_id`),
    `recipient_name` = (SELECT `users`.`name` FROM `accounts` INNER JOIN `users` ON `users`.`id` = `accounts`.`user_id` WHERE `accounts`.`id` = `internal_transfers`.`recipient_account_id`),
    `recipient_account_name` = (SELECT `name` FROM `accounts` WHERE `id` = `internal_transfers`.`recipient_account_id`),
    `recipient_account_number` = (SELECT `number` FROM `accounts` WHERE `id` = `internal_transfers`.`recipient_account_id`);
--> statement-breakpoint
ALTER TABLE `card_requests` ADD `currency` text NOT NULL DEFAULT 'USD';
--> statement-breakpoint
UPDATE `card_requests`
SET `currency` = (SELECT `currency` FROM `accounts` WHERE `accounts`.`id` = `card_requests`.`account_id`);
--> statement-breakpoint
CREATE TABLE `transfer_quotes` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `sender_account_id` text NOT NULL,
  `recipient_account_id` text NOT NULL,
  `source_amount_minor` integer NOT NULL,
  `source_currency` text NOT NULL,
  `recipient_amount_minor` integer NOT NULL,
  `recipient_currency` text NOT NULL,
  `exchange_rate` text NOT NULL,
  `rate_date` text NOT NULL,
  `rate_timestamp` text NOT NULL,
  `rate_provider` text NOT NULL,
  `expires_at` text NOT NULL,
  `consumed_at` text,
  `created_at` text NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`sender_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`recipient_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `currency_change_requests` (
  `id` text PRIMARY KEY NOT NULL,
  `account_id` text NOT NULL,
  `user_id` text NOT NULL,
  `current_currency` text NOT NULL,
  `requested_currency` text NOT NULL,
  `reason` text,
  `status` text NOT NULL,
  `requested_at` text NOT NULL,
  `reviewed_by` text,
  `reviewed_at` text,
  `rejection_reason` text,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `currency_change_requests_pending_account_unique` ON `currency_change_requests` (`account_id`) WHERE `status` = 'pending';