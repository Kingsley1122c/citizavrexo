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
import { userUi } from "@/lib/i18n/user-ui";
import {
  accounts,
  authenticationTokens,
  credentials,
  devices,
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

const directory = join(tmpdir(), `nivora-email-auth-${process.pid}`);
const databasePath = join(directory, "email-auth.db");
let sqlite: Database.Database;
let database: ReturnType<typeof drizzle>;

beforeAll(async () => {
  mkdirSync(directory, { recursive: true });
  process.env.DATABASE_URL = databasePath;
  process.env.APP_URL = "https://nivoracore.com";
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
  it.each(["USD", "JPY", "KRW", "KWD", "EUR"] as const satisfies readonly Currency[])("persists %s as the registered account currency", async (currency) => {
    const { registerUser } = await import("./auth-service");
    const email = `registration-${currency.toLowerCase()}@example.test`;

    await registerUser({ name: `${currency} Registration`, email, password: "RegistrationPassword!2026", locale: "en", currency });

    const user = database.select().from(users).where(eq(users.email, email)).get();
    expect(database.select().from(accounts).where(eq(accounts.userId, user!.id)).get()).toMatchObject({ currency, balanceMinor: 0 });
  });

  it("immediately verifies the account and creates an authenticated session and device", async () => {
    const { registerUser } = await import("./auth-service");
    const { getAuthenticatedUser } = await import("./session-service");

    await registerUser(
      { name: "Ready User", email: "ready@example.test", password: "ReadyPassword!2026", locale: "ja", currency: "JPY" },
      { ipAddress: "203.0.113.8", userAgent: "Mobile Registration Browser" },
    );

    const user = database.select().from(users).where(eq(users.email, "ready@example.test")).get();
    const session = database.select().from(sessions).where(eq(sessions.userId, user!.id)).get();
    const device = database.select().from(devices).where(eq(devices.sessionId, session!.id)).get();
    expect(user).toMatchObject({ status: "active", locale: "ja" });
    expect(user?.emailVerifiedAt).toBeTruthy();
    expect(database.select().from(accounts).where(eq(accounts.userId, user!.id)).get()).toMatchObject({ number: expect.stringMatching(/^\d{10}$/), currency: "JPY" });
    expect(database.select().from(authenticationTokens).where(eq(authenticationTokens.userId, user!.id)).all()).toHaveLength(0);
    expect(database.select().from(userProfiles).where(eq(userProfiles.userId, user!.id)).get()).toBeUndefined();
    expect(session).toMatchObject({ ipAddress: "203.0.113.8", userAgent: "Mobile Registration Browser", revokedAt: null });
    expect(device).toMatchObject({ userId: user!.id, name: "Mobile device", location: "203.0.113.8" });
    expect(await getAuthenticatedUser()).toMatchObject({ id: user!.id, status: "active", sessionId: session!.id });
    expect(database.select().from(notifications).where(eq(notifications.eventReference, `WELCOME-${user!.id}`)).get()?.title).toBe("Welcome to Nivora Core");
    const welcomeEmail = database.select().from(emailOutbox).where(eq(emailOutbox.eventReference, `WELCOME-${user!.id}`)).get();
    expect(welcomeEmail).toMatchObject({ event: "welcome", status: "pending", attempts: 0 });
    expect(JSON.parse(welcomeEmail!.payloadJson)).toMatchObject({ locale: "ja", summary: userUi("ja").notifications.messageWelcomeReady });
    expect(welcomeEmail?.payloadJson).not.toContain("verify_email");
    expect(welcomeEmail?.payloadJson).not.toContain("tokenId");
  });

  it("rejects a duplicate registration without creating another account or session", async () => {
    const { registerUser } = await import("./auth-service");
    const input = { name: "Unique User", email: "unique@example.test", password: "UniquePassword!2026", locale: "en" as const, currency: "GBP" as const };
    await registerUser(input);
    const sessionCount = database.select().from(sessions).all().length;

    await expect(registerUser(input)).rejects.toThrow("Unable to create account");
    expect(database.select().from(users).where(eq(users.email, input.email)).all()).toHaveLength(1);
    expect(database.select().from(sessions).all()).toHaveLength(sessionCount);
  });

  it("does not invoke email delivery before granting authenticated access", async () => {
    const { registerUser } = await import("./auth-service");
    const email = "delivery-independent@example.test";
    await expect(registerUser({ name: "Delivery Independent", email, password: "DeliveryPassword!2026", locale: "en", currency: "USD" })).resolves.toBeUndefined();

    const user = database.select().from(users).where(eq(users.email, email)).get();
    expect(user).toMatchObject({ status: "active" });
    expect(database.select().from(sessions).where(eq(sessions.userId, user!.id)).all()).toHaveLength(1);
    expect(database.select().from(emailOutbox).where(eq(emailOutbox.recipient, email)).get()).toMatchObject({ status: "pending", attempts: 0 });
  });

  it("resets a password once, revokes sessions, and suppresses duplicate delivery", async () => {
    const now = new Date().toISOString();
    const oldPassword = "OriginalPassword!2026";
    database.insert(users).values({ id: "reset-user", name: "Reset User", email: "reset@example.test", avatarInitials: "RU", status: "active", emailVerifiedAt: now, locale: "en", createdAt: now, updatedAt: now }).run();
    database.insert(credentials).values({ userId: "reset-user", passwordHash: await hash(oldPassword), transactionPinHash: await hash("2468"), passwordChangedAt: now }).run();
    database.insert(sessions).values({ id: "reset-session", userId: "reset-user", tokenHash: "reset-session-hash", expiresAt: "2099-01-01T00:00:00.000Z", lastActiveAt: now, createdAt: now }).run();
    const { requestPasswordReset, resetPasswordWithToken } = await import("./auth-service");
    const { messages, send, transport } = captureTransport();

    await requestPasswordReset("reset@example.test", transport);
    await requestPasswordReset("reset@example.test", transport);
    expect(send).toHaveBeenCalledOnce();
    const token = actionTokenFrom(messages[0]);
    const newPassword = "ReplacementPassword!2026";

    await resetPasswordWithToken(token, newPassword);
    const credential = database.select().from(credentials).where(eq(credentials.userId, "reset-user")).get();
    expect(await verify(credential!.passwordHash, newPassword)).toBe(true);
    expect(credential!.transactionPinHash).toBeNull();
    expect(database.select().from(sessions).where(eq(sessions.id, "reset-session")).get()?.revokedAt).toBeTruthy();
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
