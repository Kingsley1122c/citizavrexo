import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const directory = join(tmpdir(), `Citizavrexo-account-migration-${process.pid}`);
const oldMigrations = join(directory, "old-migrations");
const databasePath = join(directory, "legacy.db");
let sqlite: Database.Database;

beforeAll(() => {
  mkdirSync(join(oldMigrations, "meta"), { recursive: true });
  const journal = JSON.parse(readFileSync(resolve("drizzle/meta/_journal.json"), "utf8"));
  journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx < 10);
  writeFileSync(join(oldMigrations, "meta", "_journal.json"), JSON.stringify(journal));
  for (let index = 0; index < 10; index += 1) {
    const source = resolve("drizzle", `${String(index).padStart(4, "0")}_${journal.entries[index].tag.slice(5)}.sql`);
    cpSync(source, join(oldMigrations, basename(source)));
  }
  sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), { migrationsFolder: oldMigrations });
  const now = "2026-01-01T00:00:00.000Z";
  sqlite.prepare("INSERT INTO users (id, name, email, avatar_initials, status, locale, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("legacy-user", "Legacy User", "legacy@example.test", "LU", "active", "en", now, now);
  sqlite.prepare("INSERT INTO accounts (id, user_id, name, number, type, currency, balance_minor, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("legacy-account", "legacy-user", "Legacy Account", "2048 7310 9642", "personal", "USD", 12345, "active", now, now);
  const migration = readFileSync(resolve("drizzle/0010_lazy_bloodaxe.sql"), "utf8");
  for (const statement of migration.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) sqlite.exec(statement);
});

afterAll(() => {
  sqlite.close();
  if (existsSync(directory)) rmSync(directory, { recursive: true, force: true });
});

describe("ten-digit account migration", () => {
  it("preserves account identity and balance while safely replacing the public number", () => {
    expect(sqlite.prepare("SELECT id, user_id, number, balance_minor FROM accounts WHERE id = ?").get("legacy-account")).toEqual({ id: "legacy-account", user_id: "legacy-user", number: "8654435761", balance_minor: 12345 });
    expect(() => sqlite.prepare("UPDATE accounts SET number = ? WHERE id = ?").run("123 456", "legacy-account")).toThrow();
    expect(sqlite.pragma("foreign_key_check")).toEqual([]);
  });
});

