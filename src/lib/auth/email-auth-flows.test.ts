import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { hash, verify } from "@node-rs/argon2";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { EmailTransport } from "@/lib/notifications/email-service";
import type { Currency } from "@/lib/currency";
import {
  accounts,
  authenticationTokens,
  credentials,
  emailOutbox,
  notifications,
  sessions,
  userProfiles,
  users,
} from "@/lib/db/schema";

const cookieStore = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    delete: (name: string) => cookieStore.delete(name),
    get: (name: string) => cookieStore.has(name) ? { name, value: cookieStore.get(name)! } : undefined,
    set: (name: string, value: string) => cookieStore.set(name, value),
  })),
}));

const directory = join(tmpdir(), `Citizavrexo-email-auth-${process.pid}`);
const databasePath = join(directory, "email-auth.db");
let sqlite: Database.Database;
let database: ReturnType<typeof drizzle>;

beforeAll(async () => {
  mkdirSync(directory, { recursive: true });
  process.env.DATABASE_URL = databasePath;
  process.env.APP_URL = "https://citizavrexo.com";
  process.env.RECOVERY_CODE_PEPPER = "test-only-recovery-pepper-at-least-32-characters";
  sqlite = new Database(databasePath);
  database = drizzle(sqlite);
  migrate(database, { migrationsFolder: resolve("drizzle") });
});

afterAll(async () => {
  const { closeDatabaseConnection } = await import("@/lib/db/client");
  closeDatabaseConnection();
  sqlite.close();
  if (existsSync(directory)) rmSync(directory, { recursive: true, force: true });
});

function actionTokenFrom(message: { text: string }): string {
  const match = message.text.match(/[?&]token=([A-Za-z0-9_-]+)/);
  if (!match) throw new Error("Expected an action token in the email URL.");
  return match[1];
}

function captureTransport() {
  const messages: Parameters<EmailTransport["send"]>[0][] = [];
  const send = vi.fn(async (message: Parameters<EmailTransport["send"]>[0]) => { messages.push(message); });
  return { messages, send, transport: { send } };
}

describe("email-backed authentication", () => {
  it("skips taken username suggestions and confirms availability against SQLite", async () => {
    const now = new Date().toISOString();
    database.insert(users).values([
      { id: "suggestion-taken-plain", name: "Existing Plain", username: "johnmichael", email: "existing-plain@example.test", avatarInitials: "EP", status: "active", emailVerifiedAt: now, locale: "en", createdAt: now, updatedAt: now },
      { id: "suggestion-taken-dotted", name: "Existing Dotted", username: "john.michael", email: "existing-dotted@example.test", avatarInitials: "ED", status: "active", emailVerifiedAt: now, locale: "en", createdAt: now, updatedAt: now },
    ]).run();
    const { isUsernameAvailable, suggestAvailableUsernames } = await import("./username-service");

    expect(suggestAvailableUsernames("John Michael", [], 2026)[0]).toBe("johnmichael26");
    expect(isUsernameAvailable("JOHNMICHAEL")).toBe(false);
    expect(isUsernameAvailable("johnmichael26")).toBe(true);
  });

  it.each(["USD", "JPY", "KRW", "KWD", "EUR"] as const satisfies readonly Currency[])("persists %s as the registered account currency", async (currency) => {
    const { registerUser } = await import("./auth-service");
    const email = `registration-${currency.toLowerCase()}@example.test`;

    await registerUser({ name: `${currency} Registration`, username: `registration.${currency.toLowerCase()}`, email, password: "RegistrationPassword!2026", pin: "2468", locale: "en", currency }, undefined, captureTransport().transport);

    const user = database.select().from(users).where(eq(users.email, email)).get();
    expect(database.select().from(accounts).where(eq(accounts.userId, user!.id)).get()).toMatchObject({ currency, balanceMinor: 0 });
  });

  it("keeps the account pending until its single-use email link is verified", async () => {
    const { registerUser } = await import("./auth-service");
    const { getAuthenticatedUser } = await import("./session-service");
    const { messages, transport } = captureTransport();

    await registerUser(
      { name: "Ready User", username: "ready.user", email: "ready@example.test", password: "ReadyPassword!2026", pin: "2468", locale: "ja", currency: "JPY" },
      { ipAddress: "203.0.113.8", userAgent: "Mobile Registration Browser" },
      transport,
    );

    let user = database.select().from(users).where(eq(users.email, "ready@example.test")).get();
    expect(user).toMatchObject({ username: "ready.user", status: "pending", locale: "ja", emailVerifiedAt: null });
    expect(database.select().from(accounts).where(eq(accounts.userId, user!.id)).get()).toMatchObject({ number: expect.stringMatching(/^\d{10}$/), currency: "JPY" });
    expect(database.select().from(authenticationTokens).where(eq(authenticationTokens.userId, user!.id)).all()).toHaveLength(1);
    expect(database.select().from(userProfiles).where(eq(userProfiles.userId, user!.id)).get()).toBeUndefined();
    expect(database.select().from(sessions).where(eq(sessions.userId, user!.id)).all()).toHaveLength(0);
    expect(await getAuthenticatedUser()).toBeNull();
    expect(messages).toHaveLength(1);
    expect(messages[0].text).toContain("https://citizavrexo.com/verify-email?token=");

    const { loginUser, verifyRegisteredEmail } = await import("./auth-service");
    const verificationToken = actionTokenFrom(messages[0]);
    expect(() => verifyRegisteredEmail(verificationToken, "wrong@example.test")).toThrow("invalid or expired");
    verifyRegisteredEmail(verificationToken, "READY@EXAMPLE.TEST");
    user = database.select().from(users).where(eq(users.email, "ready@example.test")).get();
    expect(user).toMatchObject({ status: "active" });
    expect(user?.emailVerifiedAt).toBeTruthy();
    expect(database.select().from(notifications).where(eq(notifications.eventReference, `WELCOME-${user!.id}`)).get()?.title).toBe("Welcome to CITIZAVREXO");
    expect(() => verifyRegisteredEmail(verificationToken, "ready@example.test")).toThrow("invalid or expired");
    await expect(loginUser({ email: "READY.USER", password: "ReadyPassword!2026", persistent: false })).resolves.toBeUndefined();
  });

  it("rejects a duplicate registration without creating another account or session", async () => {
    const { registerUser } = await import("./auth-service");
    const input = { name: "Unique User", username: "unique.user", email: "unique@example.test", password: "UniquePassword!2026", pin: "2468", locale: "en" as const, currency: "GBP" as const };
    await registerUser(input, undefined, captureTransport().transport);
    const sessionCount = database.select().from(sessions).all().length;

    await expect(registerUser(input, undefined, captureTransport().transport)).rejects.toThrow("Unable to create account");
    expect(database.select().from(users).where(eq(users.email, input.email)).all()).toHaveLength(1);
    expect(database.select().from(sessions).all()).toHaveLength(sessionCount);
  });

  it("rejects a duplicate normalized username with a different email", async () => {
    const { registerUser } = await import("./auth-service");
    const first = { name: "First User", username: "shared.user", email: "first-user@example.test", password: "UniquePassword!2026", pin: "2468", locale: "en" as const, currency: "USD" as const };
    const second = { ...first, name: "Second User", username: "SHARED.USER", email: "second-user@example.test" };

    await registerUser(first, undefined, captureTransport().transport);
    await expect(registerUser(second, undefined, captureTransport().transport)).rejects.toThrow("Unable to create account");
    expect(database.select().from(users).where(eq(users.username, "shared.user")).all()).toHaveLength(1);
  });

  it("preserves a pending account after uncertain delivery and rotates its verification link", async () => {
    const { registerUser, requestEmailVerification, verifyRegisteredEmail } = await import("./auth-service");
    const email = "delivery-independent@example.test";
    const failedTransport = { send: vi.fn(async () => { throw new Error("provider unavailable"); }) };
    await expect(registerUser({ name: "Delivery Independent", username: "delivery.independent", email, password: "DeliveryPassword!2026", pin: "2468", locale: "en", currency: "USD" }, undefined, failedTransport)).rejects.toThrow("account remains pending");

    const user = database.select().from(users).where(eq(users.email, email)).get()!;
    const originalToken = database.select().from(authenticationTokens).where(eq(authenticationTokens.userId, user.id)).get()!;
    expect(user).toMatchObject({ status: "pending", emailVerifiedAt: null });
    expect(database.select().from(emailOutbox).where(eq(emailOutbox.recipient, email)).get()).toMatchObject({ status: "failed" });

    const { messages, transport } = captureTransport();
    await requestEmailVerification(email, transport);
    expect(messages).toHaveLength(1);
    expect(database.select().from(authenticationTokens).where(eq(authenticationTokens.id, originalToken.id)).get()?.usedAt).toBeTruthy();
    expect(() => verifyRegisteredEmail(actionTokenFrom(messages[0]), email)).not.toThrow();
    expect(database.select().from(users).where(eq(users.id, user.id)).get()).toMatchObject({ status: "active" });
  });

  it("rotates recovery links, resets a password once, and revokes sessions", async () => {
    const now = new Date().toISOString();
    const oldPassword = "OriginalPassword!2026";
    database.insert(users).values({ id: "reset-user", name: "Reset User", email: "reset@example.test", avatarInitials: "RU", status: "active", emailVerifiedAt: now, locale: "en", createdAt: now, updatedAt: now }).run();
    database.insert(credentials).values({ userId: "reset-user", passwordHash: await hash(oldPassword), transactionPinHash: await hash("2468"), passwordChangedAt: now }).run();
    database.insert(sessions).values({ id: "reset-session", userId: "reset-user", tokenHash: "reset-session-hash", expiresAt: "2099-01-01T00:00:00.000Z", lastActiveAt: now, createdAt: now }).run();
    const { loginUser, requestPasswordReset, resetPasswordWithToken } = await import("./auth-service");
    const { messages, send, transport } = captureTransport();

    await requestPasswordReset("reset@example.test", transport);
    const firstToken = actionTokenFrom(messages[0]);
    await requestPasswordReset("reset@example.test", transport);
    expect(send).toHaveBeenCalledTimes(2);
    expect(messages[1].text).toContain("https://citizavrexo.com/reset-password?token=");
    const token = actionTokenFrom(messages[1]);
    expect(token).not.toBe(firstToken);
    await expect(resetPasswordWithToken(firstToken, "RejectedPassword!2026")).rejects.toThrow("invalid or expired");
    const newPassword = "ReplacementPassword!2026";

    await resetPasswordWithToken(token, newPassword);
    const credential = database.select().from(credentials).where(eq(credentials.userId, "reset-user")).get();
    expect(await verify(credential!.passwordHash, newPassword)).toBe(true);
    expect(credential!.transactionPinHash).toBeNull();
    expect(database.select().from(sessions).where(eq(sessions.id, "reset-session")).get()?.revokedAt).toBeTruthy();
    await expect(loginUser({ email: "reset@example.test", password: newPassword, persistent: false }, { ipAddress: "203.0.113.9", userAgent: "Reset Login Browser" })).resolves.toBeUndefined();
    expect(database.select().from(sessions).where(eq(sessions.userId, "reset-user")).all().length).toBeGreaterThan(1);
    await expect(resetPasswordWithToken(token, "AnotherPassword!2026")).rejects.toThrow("invalid or expired");
    expect(database.select().from(authenticationTokens).where(eq(authenticationTokens.userId, "reset-user")).get()?.usedAt).toBeTruthy();
  });

  it("rejects an expired password-reset link", async () => {
    const now = new Date().toISOString();
    database.insert(users).values({ id: "expired-reset-user", name: "Expired Reset", email: "expired-reset@example.test", avatarInitials: "ER", status: "active", emailVerifiedAt: now, locale: "en", createdAt: now, updatedAt: now }).run();
    database.insert(credentials).values({ userId: "expired-reset-user", passwordHash: await hash("OriginalPassword!2026"), passwordChangedAt: now }).run();
    const { requestPasswordReset, resetPasswordWithToken } = await import("./auth-service");
    const { messages, transport } = captureTransport();
    await requestPasswordReset("expired-reset@example.test", transport);
    const token = actionTokenFrom(messages[0]);

    await expect(resetPasswordWithToken(token, "ReplacementPassword!2026", new Date(Date.now() + 31 * 60 * 1000))).rejects.toThrow("invalid or expired");
  });
});

