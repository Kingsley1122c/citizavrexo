ALTER TABLE `withdrawal_requests` ADD `authorization_stage` text NOT NULL DEFAULT 'awaiting_withdrawal_code';
--> statement-breakpoint
ALTER TABLE `withdrawal_requests` ADD `pin_verified_at` text;
--> statement-breakpoint
ALTER TABLE `withdrawal_requests` ADD `authorization_completed_at` text;
--> statement-breakpoint
CREATE TABLE `withdrawal_authorization_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`withdrawal_request_id` text NOT NULL,
	`user_id` text NOT NULL,
	`stage` text NOT NULL,
	`code_hash` text NOT NULL,
	`status` text NOT NULL DEFAULT 'issued',
	`issued_by` text NOT NULL,
	`issued_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`verified_at` text,
	`revoked_at` text,
	`revoked_by` text,
	`failed_attempts` integer NOT NULL DEFAULT 0,
	`locked_until` text,
	`last_failed_at` text,
	`replaced_by_code_id` text,
	FOREIGN KEY (`withdrawal_request_id`) REFERENCES `withdrawal_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`issued_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`revoked_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`replaced_by_code_id`) REFERENCES `withdrawal_authorization_codes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `withdrawal_authorization_codes_hash_unique` ON `withdrawal_authorization_codes` (`code_hash`);
--> statement-breakpoint
CREATE UNIQUE INDEX `withdrawal_authorization_codes_stage_active_unique` ON `withdrawal_authorization_codes` (`withdrawal_request_id`,`stage`) WHERE `withdrawal_authorization_codes`.`status` = 'issued';
--> statement-breakpoint
CREATE TABLE `withdrawal_authorization_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`withdrawal_request_id` text NOT NULL,
	`user_id` text NOT NULL,
	`stage` text NOT NULL,
	`code_id` text,
	`outcome` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`withdrawal_request_id`) REFERENCES `withdrawal_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`code_id`) REFERENCES `withdrawal_authorization_codes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `withdrawal_authorization_attempts_code_stage_timestamp_unique` ON `withdrawal_authorization_attempts` (`withdrawal_request_id`,`stage`,`created_at`,`id`);