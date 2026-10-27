UPDATE `accounts` SET `currency` = 'USD' WHERE `currency` <> 'USD';
--> statement-breakpoint
UPDATE `users` SET `display_currency` = 'USD' WHERE `display_currency` <> 'USD';
--> statement-breakpoint
UPDATE `transactions` SET `currency` = 'USD' WHERE `currency` <> 'USD';
--> statement-breakpoint
UPDATE `internal_transfers` SET `currency` = 'USD' WHERE `currency` <> 'USD';
--> statement-breakpoint
UPDATE `withdrawal_requests`
SET `destination_id` = (
	SELECT min(`candidate`.`id`)
	FROM `bank_destinations` AS `candidate`
	WHERE `candidate`.`user_id` = (SELECT `source`.`user_id` FROM `bank_destinations` AS `source` WHERE `source`.`id` = `withdrawal_requests`.`destination_id`)
		AND `candidate`.`bank_name` = (SELECT `source`.`bank_name` FROM `bank_destinations` AS `source` WHERE `source`.`id` = `withdrawal_requests`.`destination_id`)
		AND `candidate`.`account_number` = (SELECT `source`.`account_number` FROM `bank_destinations` AS `source` WHERE `source`.`id` = `withdrawal_requests`.`destination_id`)
)
WHERE `destination_id` IS NOT NULL;
--> statement-breakpoint
DELETE FROM `bank_destinations`
WHERE `id` <> (
	SELECT min(`candidate`.`id`)
	FROM `bank_destinations` AS `candidate`
	WHERE `candidate`.`user_id` = `bank_destinations`.`user_id`
		AND `candidate`.`bank_name` = `bank_destinations`.`bank_name`
		AND `candidate`.`account_number` = `bank_destinations`.`account_number`
);
--> statement-breakpoint
UPDATE `bank_destinations` SET `currency` = 'USD' WHERE `currency` <> 'USD';
--> statement-breakpoint
UPDATE `withdrawal_requests` SET `currency` = 'USD' WHERE `currency` <> 'USD';
--> statement-breakpoint
UPDATE `admin_credits` SET `currency` = 'USD' WHERE `currency` <> 'USD';
--> statement-breakpoint
UPDATE `notifications`
SET `message` = replace(replace(`message`, char(78,71,78), 'USD'), char(8358), '$')
WHERE instr(`message`, char(78,71,78)) > 0 OR instr(`message`, char(8358)) > 0;
--> statement-breakpoint
UPDATE `email_outbox`
SET `payload_json` = replace(replace(`payload_json`, char(78,71,78), 'USD'), char(8358), '$')
WHERE instr(`payload_json`, char(78,71,78)) > 0 OR instr(`payload_json`, char(8358)) > 0;