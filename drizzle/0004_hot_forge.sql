ALTER TABLE `transactions` ADD `idempotency_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_idempotency_key_unique` ON `transactions` (`idempotency_key`);