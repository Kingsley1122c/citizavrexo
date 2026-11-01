import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const directory = join(tmpdir(), `Citizavrexo-usd-migration-${process.pid}`);
const oldMigrations = join(directory, "old-migrations");
const databasePath = join(directory, "legacy.db");
const legacyCurrency = String.fromCharCode(69, 85, 82);
const legacyCode = String.fromCharCode(78, 71, 78);
const legacySymbol = String.fromCharCode(8358);
let sqlite: Database.Database;

beforeAll(() => {
  mkdirSync(join(oldMigrations, "meta"), { recursive: true });
  const journal = JSON.parse(readFileSync(resolve("drizzle/meta/_journal.json"), "utf8"));
  const oldJournal = { ...journal, entries: journal.entries.filter((entry: { idx: number }) => entry.idx <= 12) };
  writeFileSync(join(oldMigrations, "meta", "_journal.json"), JSON.stringify(oldJournal));
  for (const entry of oldJournal.entries) {
    const source = resolve("drizzle", `${entry.tag}.sql`);
    cpSync(source, join(oldMigrations, basename(source)));
  }

  sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), { migrationsFolder: oldMigrations });

  const now = "2026-01-01T00:00:00.000Z";
  sqlite.prepare("INSERT INTO users (id, name, email, avatar_initials, status, locale, display_currency, admin_role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("legacy-user", "Legacy User", "legacy@example.test", "LU", "active", "en", legacyCurrency, null, now, now);
  sqlite.prepare("INSERT INTO users (id, name, email, avatar_initials, status, locale, display_currency, admin_role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("legacy-admin", "Legacy Admin", "legacy-admin@example.test", "LA", "active", "en", legacyCurrency, "super_admin", now, now);
  sqlite.prepare("INSERT INTO accounts (id, user_id, name, number, type, currency, balance_minor, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("legacy-account", "legacy-user", "Legacy Account", "7000000001", "personal", legacyCurrency, 5000, "active", now, now);
  sqlite.prepare("INSERT INTO accounts (id, user_id, name, number, type, currency, balance_minor, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("legacy-recipient", "legacy-user", "Legacy Savings", "7000000002", "savings", legacyCurrency, 1000, "active", now, now);
  sqlite.prepare("INSERT INTO transactions (id, reference, idempotency_key, account_id, type, description, amount_minor, currency, occurred_at, status, balance_before_minor, balance_after_minor, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("legacy-transaction", "LEGACY-TX", "legacy-tx-key", "legacy-account", "credit", "Legacy credit", 1000, legacyCurrency, now, "completed", 4000, 5000, "legacy-admin", now);
  sqlite.prepare("INSERT INTO internal_transfers (id, reference, idempotency_key, sender_account_id, recipient_account_id, amount_minor, currency, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("legacy-transfer", "LEGACY-TRANSFER", "legacy-transfer-key", "legacy-account", "legacy-recipient", 100, legacyCurrency, "completed", "legacy-user", now);
  sqlite.prepare("INSERT INTO bank_destinations (id, user_id, label, bank_name, account_name, account_number, country, destination_type, currency, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("legacy-destination", "legacy-user", "Legacy bank", "Legacy Bank", "Legacy User", "1234567890", "US", "bank_account", legacyCurrency, now, now);
  sqlite.prepare("INSERT INTO bank_destinations (id, user_id, label, bank_name, account_name, account_number, country, destination_type, currency, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("existing-usd-destination", "legacy-user", "USD bank", "Legacy Bank", "Legacy User", "1234567890", "US", "bank_account", "USD", now, now);
  sqlite.prepare("INSERT INTO withdrawal_requests (id, reference, idempotency_key, user_id, account_id, destination_id, amount_minor, currency, status, submitted_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("legacy-withdrawal", "LEGACY-WITHDRAWAL", "legacy-withdrawal-key", "legacy-user", "legacy-account", "legacy-destination", 100, legacyCurrency, "completed", now, now);
  sqlite.prepare("INSERT INTO admin_credits (id, reference, idempotency_key, user_id, account_id, transaction_id, amount_minor, currency, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("legacy-admin-credit", "LEGACY-CREDIT", "legacy-credit-key", "legacy-user", "legacy-account", "legacy-transaction", 1000, legacyCurrency, "Legacy reason", "legacy-admin", now);
  sqlite.prepare("INSERT INTO notifications (id, user_id, kind, title, message, event_reference, important, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("legacy-notification", "legacy-user", "credit", "Legacy currency", `Legacy ${legacyCode} ${legacySymbol}`, "LEGACY-EVENT", 1, now);
  sqlite.prepare("INSERT INTO email_outbox (id, recipient, event, event_reference, payload_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run("legacy-email", "legacy@example.test", "transaction_completed", "LEGACY-EMAIL", JSON.stringify({ summary: `Legacy ${legacyCode} ${legacySymbol}` }), "pending", now);

  migrate(drizzle(sqlite), { migrationsFolder: resolve("drizzle") });
});

afterAll(() => {
  sqlite.close();
  if (existsSync(directory)) rmSync(directory, { recursive: true, force: true });
});

describe("USD-only migration", () => {
  it("normalizes every persisted financial currency and legacy message identifier", () => {
    for (const table of ["users", "accounts", "transactions", "internal_transfers", "bank_destinations", "withdrawal_requests", "admin_credits"]) {
      const column = table === "users" ? "display_currency" : "currency";
      expect(sqlite.prepare(`SELECT DISTINCT ${column} AS currency FROM ${table}`).all()).toEqual([{ currency: "USD" }]);
    }
    expect(sqlite.prepare("SELECT name FROM accounts WHERE id = ?").get("legacy-account")).toEqual({ name: "Legacy Account" });
    expect(sqlite.prepare("SELECT name FROM accounts WHERE id = ?").get("legacy-recipient")).toEqual({ name: "Legacy Savings" });
    expect(sqlite.prepare("SELECT id, currency FROM bank_destinations WHERE user_id = ?").all("legacy-user")).toEqual([{ id: "existing-usd-destination", currency: "USD" }]);
    expect(sqlite.prepare("SELECT destination_id FROM withdrawal_requests WHERE id = ?").get("legacy-withdrawal")).toEqual({ destination_id: "existing-usd-destination" });
    expect(sqlite.prepare("SELECT message FROM notifications WHERE id = ?").get("legacy-notification")).toEqual({ message: "Legacy USD $" });
    expect(sqlite.prepare("SELECT payload_json FROM email_outbox WHERE id = ?").get("legacy-email")).toEqual({ payload_json: JSON.stringify({ summary: "Legacy USD $" }) });
    expect(sqlite.pragma("foreign_key_check")).toEqual([]);
  });
});
