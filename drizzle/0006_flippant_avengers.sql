ALTER TABLE `email_outbox` ADD `next_attempt_at` text;--> statement-breakpoint
CREATE UNIQUE INDEX `email_outbox_event_reference_unique` ON `email_outbox` (`event_reference`);