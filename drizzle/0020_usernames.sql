ALTER TABLE `users` ADD `username` text;
--> statement-breakpoint
UPDATE `users` SET `username` = 'user_' || lower(replace(`id`, '-', '')) WHERE `username` IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);