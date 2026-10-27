import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { hash } from "@node-rs/argon2";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { administratorTransfers, auditEvents, credentials, devices, sessions, users } from "@/lib/db/schema";

const directory = join(tmpdir(), `nivora-transfer-${process.pid}`);
const databasePath = join(directory, "transfer.db");
const currentPassword = "CurrentAdmin!2026";
const replacementPassword = "ReplacementAdmin!2026";
let sqlite: Database.Database;
let database: ReturnType<typeof drizzle>;

async function createIdentity(id: string, email: string, role: "super_admin" | null) {
  const now = new Date().toISOString();
  database.insert(users).values({ id, name: "Current Administrator", email, avatarInitials: "CA", status: "active", emailVerifiedAt: now, locale: "en", adminRole: role, createdAt: now, updatedAt: now }).run();
  database.insert(credentials).values({ userId: id, passwordHash: await hash(currentPassword, { memoryCost: 19456, timeCost: 2, parallelism: 1 }), passwordChangedAt: now }).run();
}

beforeAll(async () => {
  mkdirSync(directory, { recursive: true });
  process.env.DATABASE_URL = databasePath;
  sqlite = new Database(databasePath);
  database = drizzle(sqlite);
  migrate(database, { migrationsFolder: resolve("drizzle") });
  await createIdentity("admin-unauthorized", "ordinary@example.test", null);
  await createIdentity("admin-reauth", "reauth@example.test", "super_admin");
  await createIdentity("admin-expired", "expired@example.test", "super_admin");
  await createIdentity("admin-success", "owner@example.test", "super_admin");
});

afterAll(async () => {
  const { closeDatabaseConnection } = await import("@/lib/db/client");
  closeDatabaseConnection();
  sqlite.close();
  if (existsSync(directory)) rmSync(directory, { recursive: true, force: true });
});

describe("administrator ownership transfer", () => {
  it("rejects an authenticated user without the super-admin role", async () => {
    const { initiateAdministratorTransfer } = await import("./administrator-transfer-service");
    await expect(initiateAdministratorTransfer({ actorId: "admin-unauthorized", currentPassword, newEmail: "client-one@example.test", deliver: vi.fn() })).rejects.toThrow("could not be completed");
    expect(database.select().from(administratorTransfers).where(eq(administratorTransfers.initiatedByUserId, "admin-unauthorized")).all()).toHaveLength(0);
  });

  it("requires the current administrator password", async () => {
    const { initiateAdministratorTransfer } = await import("./administrator-transfer-service");
    await expect(initiateAdministratorTransfer({ actorId: "admin-reauth", currentPassword: "WrongPassword!2026", newEmail: "client-two@example.test", deliver: vi.fn() })).rejects.toThrow("could not be completed");
    expect(database.select().from(auditEvents).where(eq(auditEvents.actorId, "admin-reauth")).all()).toContainEqual(expect.objectContaining({ action: "admin.transfer.request", result: "denied" }));
  });

  it("rejects wrong and expired verification tokens", async () => {
    const { completeAdministratorTransfer, initiateAdministratorTransfer } = await import("./administrator-transfer-service");
    let token = "";
    const started = new Date("2026-09-11T12:00:00.000Z");
    await initiateAdministratorTransfer({ actorId: "admin-expired", currentPassword, newEmail: "client-three@example.test", now: started, deliver: vi.fn(async (message) => { token = message.verificationToken; }) });
    await expect(completeAdministratorTransfer({ verificationToken: "x".repeat(43), newAdministratorName: "Client Owner", newPassword: replacementPassword, now: new Date("2026-09-11T12:10:00.000Z") })).rejects.toThrow("could not be completed");
    await expect(completeAdministratorTransfer({ verificationToken: token, newAdministratorName: "Client Owner", newPassword: replacementPassword, now: new Date("2026-09-11T12:31:00.000Z") })).rejects.toThrow("could not be completed");
  });

  it("atomically transfers ownership, verifies the recipient, revokes old access, audits the change, and prevents reuse", async () => {
    const { completeAdministratorTransfer, initiateAdministratorTransfer } = await import("./administrator-transfer-service");
    const now = new Date("2026-09-11T13:00:00.000Z");
    database.insert(sessions).values({ id: "old-admin-session", userId: "admin-success", tokenHash: "old-admin-session-hash", expiresAt: "2099-01-01T00:00:00.000Z", lastActiveAt: now.toISOString(), createdAt: now.toISOString() }).run();
    database.insert(devices).values({ id: "old-admin-device", userId: "admin-success", sessionId: "old-admin-session", name: "Desktop device", browser: "Test browser", location: "Test location", lastActiveAt: now.toISOString(), loginAt: now.toISOString(), trusted: true }).run();
    let token = "";
    await initiateAdministratorTransfer({ actorId: "admin-success", currentPassword, newEmail: "client-owner@example.test", now, deliver: vi.fn(async (message) => { token = message.verificationToken; }) });

    expect(JSON.stringify(database.select().from(administratorTransfers).all())).not.toContain(token);
    await completeAdministratorTransfer({ verificationToken: token, newAdministratorName: "Client Owner", newPassword: replacementPassword, now: new Date("2026-09-11T13:05:00.000Z") });

    const oldAdministrator = database.select().from(users).where(eq(users.id, "admin-success")).get();
    const newAdministrator = database.select().from(users).where(eq(users.email, "client-owner@example.test")).get();
    expect(oldAdministrator).toMatchObject({ adminRole: null, status: "suspended" });
    expect(newAdministrator).toMatchObject({ name: "Client Owner", adminRole: "super_admin", status: "active", emailVerifiedAt: "2026-09-11T13:05:00.000Z" });
    expect(database.select().from(sessions).where(eq(sessions.id, "old-admin-session")).get()?.revokedAt).toBeTruthy();
    expect(database.select().from(devices).where(eq(devices.id, "old-admin-device")).get()).toMatchObject({ trusted: false, revokedAt: "2026-09-11T13:05:00.000Z" });
    expect(database.select().from(auditEvents).where(eq(auditEvents.target, newAdministrator!.id)).get()).toMatchObject({ action: "admin.transfer.complete", result: "success" });
    await expect(completeAdministratorTransfer({ verificationToken: token, newAdministratorName: "Client Owner", newPassword: replacementPassword })).rejects.toThrow("could not be completed");

    const independentConnection = new Database(databasePath, { readonly: true });
    expect(independentConnection.prepare("select admin_role, email_verified_at from users where email = ?").get("client-owner@example.test")).toMatchObject({ admin_role: "super_admin", email_verified_at: "2026-09-11T13:05:00.000Z" });
    independentConnection.close();
  });
});