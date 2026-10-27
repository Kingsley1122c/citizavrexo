CREATE TABLE `transfer_pin_authorizations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`quote_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`quote_id`) REFERENCES `transfer_quotes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transfer_pin_authorizations_quote_unique` ON `transfer_pin_authorizations` (`quote_id`);