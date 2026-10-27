CREATE TABLE `internal_transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`sender_account_id` text NOT NULL,
	`recipient_account_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`status` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`sender_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`recipient_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `internal_transfers_reference_unique` ON `internal_transfers` (`reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `internal_transfers_idempotency_key_unique` ON `internal_transfers` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `withdrawal_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`status` text NOT NULL,
	`submitted_at` text NOT NULL,
	`reviewed_by` text,
	`reviewed_at` text,
	`rejection_reason` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `withdrawal_requests_reference_unique` ON `withdrawal_requests` (`reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `withdrawal_requests_idempotency_key_unique` ON `withdrawal_requests` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `withdrawal_requests_pending_account_unique` ON `withdrawal_requests` (`account_id`) WHERE "withdrawal_requests"."status" = 'pending';