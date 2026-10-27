CREATE TABLE `auth_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`reset_at` text NOT NULL
);
