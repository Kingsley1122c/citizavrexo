ALTER TABLE `devices` ADD `session_id` text REFERENCES sessions(id);--> statement-breakpoint
CREATE UNIQUE INDEX `devices_session_id_unique` ON `devices` (`session_id`);--> statement-breakpoint
ALTER TABLE `email_outbox` ADD `locked_at` text;
--> statement-breakpoint
CREATE TRIGGER `audit_events_no_update`
BEFORE UPDATE ON `audit_events`
BEGIN
	SELECT RAISE(ABORT, 'Audit events are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `audit_events_no_delete`
BEFORE DELETE ON `audit_events`
BEGIN
	SELECT RAISE(ABORT, 'Audit events are immutable');
END;