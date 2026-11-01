import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const directory = join(tmpdir(), `Citizavrexo-multi-currency-migration-${process.pid}`);
const oldMigrations = join(directory, "old-migrations");
const databasePath = join(directory, "legacy.db");
let sqlite: Database.Database;

beforeAll(() => {
  mkdirSync(join(oldMigrations, "meta"), { recursive: true });
  const journal = JSON.parse(readFileSync(resolve("drizzle/meta/_journal.json"), "utf8"));
  const oldJournal = { ...journal, entries: journal.entries.filter((entry: { idx: number }) => entry.idx <= 14) };
  writeFileSync(join(oldMigrations, "meta", "_journal.json"), JSON.stringify(oldJournal));
  for (const entry of oldJournal.entries) cpSync(resolve("drizzle", `${entry.tag}.sql`), join(oldMigrations, basename(`${entry.tag}.sql`)));
  sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), { migrationsFolder: oldMigrations });
  const now = "2026-09-14T12:00:00.000Z";
  sqlite.prepare("INSERT INTO users (id,name,email,avatar_initials,status,locale,display_currency,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").run("legacy-user", "Legacy User", "legacy@example.test", "LU", "active", "en", "USD", now, now);
  sqlite.prepare("INSERT INTO users (id,name,email,avatar_initials,status,locale,display_currency,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").run("legacy-recipient", "Legacy Recipient", "recipient@example.test", "LR", "active", "en", "USD", now, now);
  sqlite.prepare("INSERT INTO accounts (id,user_id,name,number,type,currency,balance_minor,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").run("legacy-account", "legacy-user", "Personal Account", "7000000001", "personal", "USD", 5000, "active", now, now);
  sqlite.prepare("INSERT INTO accounts (id,user_id,name,number,type,currency,balance_minor,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").run("legacy-recipient-account", "legacy-recipient", "Personal Account", "7000000002", "personal", "USD", 1000, "active", now, now);
  sqlite.prepare("INSERT INTO internal_transfers (id,reference,idempotency_key,sender_account_id,recipient_account_id,amount_minor,currency,status,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)").run("legacy-transfer", "NVT-LEGACY", "legacy-transfer-key", "legacy-account", "legacy-recipient-account", 100, "USD", "completed", "legacy-user", now);
  sqlite.prepare("INSERT INTO card_requests (id,user_id,account_id,label,card_type,monthly_limit_minor,status,submitted_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").run("legacy-card-request", "legacy-user", "legacy-account", "Legacy card", "physical", 10000, "rejected", now, now);
  migrate(drizzle(sqlite), { migrationsFolder: resolve("drizzle") });
});

afterAll(() => {
  sqlite.close();
  if (existsSync(directory)) rmSync(directory, { recursive: true, force: true });
});

describe("multi-currency migration", () => {
  it("preserves balances and historical currencies while backfilling 1:1 transfer metadata", () => {
    expect(sqlite.prepare("SELECT currency,balance_minor FROM accounts WHERE id='legacy-account'").get()).toEqual({ currency: "USD", balance_minor: 5000 });
    expect(sqlite.prepare("SELECT amount_minor,currency,recipient_amount_minor,recipient_currency,exchange_rate,rate_date,rate_timestamp,rate_provider,sender_name,sender_account_name,sender_account_number,recipient_name,recipient_account_name,recipient_account_number FROM internal_transfers WHERE id='legacy-transfer'").get()).toEqual({ amount_minor: 100, currency: "USD", recipient_amount_minor: 100, recipient_currency: "USD", exchange_rate: "1", rate_date: "2026-09-14", rate_timestamp: "2026-09-14T12:00:00.000Z", rate_provider: "same_currency", sender_name: "Legacy User", sender_account_name: "Personal Account", sender_account_number: "7000000001", recipient_name: "Legacy Recipient", recipient_account_name: "Personal Account", recipient_account_number: "7000000002" });
    expect(sqlite.prepare("SELECT currency FROM card_requests WHERE id='legacy-card-request'").get()).toEqual({ currency: "USD" });
    expect(sqlite.prepare("SELECT COUNT(*) count FROM currency_change_requests").get()).toEqual({ count: 0 });
    expect(sqlite.pragma("foreign_key_check")).toEqual([]);
  });
});
