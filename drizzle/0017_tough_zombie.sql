CREATE TABLE `admin_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`idempotency_key` text NOT NULL,
	`recipient_user_id` text NOT NULL,
	`recipient_name` text NOT NULL,
	`recipient_email` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`sent_by` text NOT NULL,
	`outbox_id` text NOT NULL,
	`delivery_status` text NOT NULL,
	`created_at` text NOT NULL,
	`delivered_at` text,
	FOREIGN KEY (`recipient_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`sent_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`outbox_id`) REFERENCES `email_outbox`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_messages_idempotency_key_unique` ON `admin_messages` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `admin_messages_outbox_unique` ON `admin_messages` (`outbox_id`);