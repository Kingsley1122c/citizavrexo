import { existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { verify } from "@node-rs/argon2";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { initializeEphemeralDatabase } from "./ephemeral-initializer";

const directory = join(tmpdir(), `Citizavrexo-ephemeral-${process.pid}`);
const databasePath = join(directory, "Citizavrexo.db");
const profileImageDirectory = join(directory, "profile-images");
const administrator = { email: "ephemeral-admin@example.test", name: "Ephemeral Administrator", password: "EphemeralPassword!2026" };

afterEach(() => {
  if (existsSync(directory)) rmSync(directory, { recursive: true, force: true });
});

describe("ephemeral database initialization", () => {
  it("migrates a fresh database and provisions one administrator without storing the password", async () => {
    await expect(initializeEphemeralDatabase({ databasePath, profileImageDirectory, migrationsFolder: resolve("drizzle"), administrator })).resolves.toEqual({ administratorCreated: true });

    const sqlite = new Database(databasePath, { readonly: true });
    const user = sqlite.prepare("SELECT id, email, admin_role, status, email_verified_at FROM users").get() as { id: string; email: string; admin_role: string; status: string; email_verified_at: string };
    const credential = sqlite.prepare("SELECT password_hash FROM credentials WHERE user_id = ?").get(user.id) as { password_hash: string };
    expect(user).toMatchObject({ email: administrator.email, admin_role: "super_admin", status: "active" });
    expect(user.email_verified_at).toBeTruthy();
    expect(credential.password_hash).not.toContain(administrator.password);
    expect(await verify(credential.password_hash, administrator.password)).toBe(true);
    expect(sqlite.prepare("SELECT action, result FROM audit_events").get()).toEqual({ action: "admin.bootstrap", result: "success" });
    sqlite.close();
    expect(existsSync(profileImageDirectory)).toBe(true);
  });

  it("is idempotent across repeated initialization and recreates the administrator after storage resets", async () => {
    const input = { databasePath, profileImageDirectory, migrationsFolder: resolve("drizzle"), administrator };
    await expect(initializeEphemeralDatabase(input)).resolves.toEqual({ administratorCreated: true });
    await expect(initializeEphemeralDatabase(input)).resolves.toEqual({ administratorCreated: false });

    let sqlite = new Database(databasePath, { readonly: true });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM users WHERE admin_role IS NOT NULL").get()).toEqual({ count: 1 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE action = 'admin.bootstrap'").get()).toEqual({ count: 1 });
    sqlite.close();

    rmSync(directory, { recursive: true, force: true });
    await expect(initializeEphemeralDatabase(input)).resolves.toEqual({ administratorCreated: true });
    sqlite = new Database(databasePath, { readonly: true });
    expect(sqlite.prepare("SELECT email FROM users WHERE admin_role = 'super_admin'").get()).toEqual({ email: administrator.email });
    sqlite.close();
  });

  it("migrates a restored persistent database without requiring or replacing bootstrap credentials", async () => {
    const input = { databasePath, profileImageDirectory, migrationsFolder: resolve("drizzle"), administrator, storageMode: "persistent" as const };
    await initializeEphemeralDatabase(input);

    await expect(initializeEphemeralDatabase({ databasePath, profileImageDirectory, migrationsFolder: resolve("drizzle"), storageMode: "persistent" })).resolves.toEqual({ administratorCreated: false });
    const sqlite = new Database(databasePath, { readonly: true });
    expect(sqlite.prepare("SELECT email FROM users WHERE admin_role = 'super_admin'").get()).toEqual({ email: administrator.email });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE action = 'admin.bootstrap'").get()).toEqual({ count: 1 });
    sqlite.close();
    expect(readdirSync(join(directory, "backups")).some((name) => name.startsWith("pre-migration-"))).toBe(true);
  });

  it("refuses to start an empty database without administrator bootstrap values", async () => {
    await expect(initializeEphemeralDatabase({ databasePath, profileImageDirectory, migrationsFolder: resolve("drizzle"), storageMode: "persistent" })).rejects.toThrow("bootstrap values");
  });
});
