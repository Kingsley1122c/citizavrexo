CREATE TABLE `accounts` (
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
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_number_unique` ON `accounts` (`number`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`actor_label` text NOT NULL,
	`action` text NOT NULL,
	`target` text NOT NULL,
	`result` text NOT NULL,
	`metadata_json` text NOT NULL,
	`timestamp` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`label` text NOT NULL,
	`last_four` text NOT NULL,
	`expires` text NOT NULL,
	`status` text NOT NULL,
	`monthly_limit_minor` integer NOT NULL,
	`monthly_spent_minor` integer NOT NULL,
	`online_payments` integer NOT NULL,
	`contactless_payments` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `credentials` (
	`user_id` text PRIMARY KEY NOT NULL,
	`password_hash` text NOT NULL,
	`transaction_pin_hash` text,
	`password_changed_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`browser` text NOT NULL,
	`location` text NOT NULL,
	`last_active_at` text NOT NULL,
	`login_at` text NOT NULL,
	`trusted` integer NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `email_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient` text NOT NULL,
	`event` text NOT NULL,
	`event_reference` text NOT NULL,
	`payload_json` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` text NOT NULL,
	`sent_at` text
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`event_reference` text,
	`important` integer NOT NULL,
	`read_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `recovery_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`used_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recovery_codes_hash_unique` ON `recovery_codes` (`code_hash`);--> statement-breakpoint
CREATE TABLE `recovery_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`method` text NOT NULL,
	`risk` text NOT NULL,
	`submitted_at` text NOT NULL,
	`reviewed_by` text,
	`reviewed_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`last_active_at` text NOT NULL,
	`revoked_at` text,
	`ip_address` text,
	`user_agent` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`account_id` text NOT NULL,
	`type` text NOT NULL,
	`description` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`occurred_at` text NOT NULL,
	`status` text NOT NULL,
	`balance_before_minor` integer NOT NULL,
	`balance_after_minor` integer NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_reference_unique` ON `transactions` (`reference`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`avatar_initials` text NOT NULL,
	`status` text NOT NULL,
	`email_verified_at` text,
	`locale` text DEFAULT 'en' NOT NULL,
	`admin_role` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);