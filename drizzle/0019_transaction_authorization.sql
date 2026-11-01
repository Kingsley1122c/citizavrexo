CREATE TABLE `transaction_authorization_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`user_id` text NOT NULL,
	`quote_id` text NOT NULL,
	`pin_authorization_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
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
	`status` text DEFAULT 'pending' NOT NULL,
	`requested_at` text NOT NULL,
	`completed_at` text,
	`transfer_reference` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`quote_id`) REFERENCES `transfer_quotes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`pin_authorization_id`) REFERENCES `transfer_pin_authorizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`sender_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`recipient_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transaction_authorization_requests_reference_unique` ON `transaction_authorization_requests` (`reference`);
--> statement-breakpoint
CREATE UNIQUE INDEX `transaction_authorization_requests_idempotency_unique` ON `transaction_authorization_requests` (`idempotency_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `transaction_authorization_requests_quote_unique` ON `transaction_authorization_requests` (`quote_id`);
--> statement-breakpoint
CREATE TABLE `transaction_authorization_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`user_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`status` text DEFAULT 'issued' NOT NULL,
	`issued_by` text NOT NULL,
	`issued_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`verified_at` text,
	`revoked_at` text,
	`revoked_by` text,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` text,
	`last_failed_at` text,
	`replaced_by_code_id` text,
	FOREIGN KEY (`request_id`) REFERENCES `transaction_authorization_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`issued_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`revoked_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transaction_authorization_codes_hash_unique` ON `transaction_authorization_codes` (`code_hash`);
--> statement-breakpoint
CREATE UNIQUE INDEX `transaction_authorization_codes_request_active_unique` ON `transaction_authorization_codes` (`request_id`) WHERE `transaction_authorization_codes`.`status` = 'issued';
--> statement-breakpoint
CREATE TABLE `transaction_authorization_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`user_id` text NOT NULL,
	`code_id` text,
	`outcome` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `transaction_authorization_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`code_id`) REFERENCES `transaction_authorization_codes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transaction_authorization_attempts_identity_unique` ON `transaction_authorization_attempts` (`id`);