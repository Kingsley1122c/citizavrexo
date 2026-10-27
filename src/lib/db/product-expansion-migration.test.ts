import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const directory = join(tmpdir(), `nivora-expansion-migration-${process.pid}`);
const oldMigrations = join(directory, "old-migrations");
const databasePath = join(directory, "legacy.db");
let sqlite: Database.Database;

beforeAll(() => {
  mkdirSync(join(oldMigrations, "meta"), { recursive: true });
  const journal = JSON.parse(readFileSync(resolve("drizzle/meta/_journal.json"), "utf8"));
  const oldJournal = { ...journal, entries: journal.entries.filter((entry: { idx: number }) => entry.idx <= 10) };
  writeFileSync(join(oldMigrations, "meta", "_journal.json"), JSON.stringify(oldJournal));
  for (const entry of oldJournal.entries) {
    const source = resolve("drizzle", `${entry.tag}.sql`);
    cpSync(source, join(oldMigrations, basename(source)));
  }
  sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), { migrationsFolder: oldMigrations });
  const now = "2026-01-01T00:00:00.000Z";
  sqlite.prepare("INSERT INTO users (id, name, email, avatar_initials, status, locale, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("legacy-expansion-user", "Legacy User", "legacy-expansion@example.test", "LU", "active", "en", now, now);
  sqlite.prepare("INSERT INTO accounts (id, user_id, name, number, type, currency, balance_minor, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("legacy-expansion-account", "legacy-expansion-user", "Legacy Account", "8654435761", "personal", "USD", 987654, "active", now, now);
  sqlite.prepare("INSERT INTO bank_destinations (id, user_id, label, bank_name, account_name, account_number, currency, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run("legacy-destination", "legacy-expansion-user", "Main bank", "Legacy Bank", "Legacy User", "0123456789", "USD", now, now);
  sqlite.prepare("INSERT INTO notifications (id, user_id, kind, title, message, event_reference, important, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("legacy-notification-1", "legacy-expansion-user", "system", "First", "First copy", "DUPLICATE-EVENT", 1, now);
  sqlite.prepare("INSERT INTO notifications (id, user_id, kind, title, message, event_reference, important, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("legacy-notification-2", "legacy-expansion-user", "system", "Second", "Second copy", "DUPLICATE-EVENT", 1, now);
  migrate(drizzle(sqlite), { migrationsFolder: resolve("drizzle") });
});

afterAll(() => {
  sqlite.close();
  if (existsSync(directory)) rmSync(directory, { recursive: true, force: true });
});

describe("product expansion migration", () => {
  it("upgrades an 0010 database without losing customer financial records", () => {
    expect(sqlite.prepare("SELECT id, user_id, number, balance_minor FROM accounts WHERE id = ?").get("legacy-expansion-account")).toEqual({ id: "legacy-expansion-account", user_id: "legacy-expansion-user", number: "8654435761", balance_minor: 987654 });
    expect(sqlite.prepare("SELECT country, destination_type FROM bank_destinations WHERE id = ?").get("legacy-destination")).toEqual({ country: "NG", destination_type: "bank_account" });
    expect(sqlite.prepare("SELECT display_currency FROM users WHERE id = ?").get("legacy-expansion-user")).toEqual({ display_currency: "USD" });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND event_reference = ?").get("legacy-expansion-user", "DUPLICATE-EVENT")).toEqual({ count: 1 });
    const tables = new Set((sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((row) => row.name));
    expect([...tables]).toEqual(expect.arrayContaining(["admin_credits", "user_profiles", "user_status_changes"]));
    expect(sqlite.pragma("foreign_key_check")).toEqual([]);
  });
});
