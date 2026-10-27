ALTER TABLE `user_profiles` ADD `review_status` text DEFAULT 'incomplete' NOT NULL;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `reviewed_by` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `reviewed_at` text;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `rejection_reason` text;