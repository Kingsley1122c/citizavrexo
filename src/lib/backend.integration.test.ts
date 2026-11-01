import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { accounts, adminCredits, adminMessages, auditEvents, authenticationTokens, authRateLimits, bankDestinations, cardRequests, cards, credentials, currencyChangeRequests, devices, emailOutbox, internalTransfers, notifications, recoveryCodes, recoveryRequests, sessions, transactionAuthorizationAttempts, transactionAuthorizationCodes, transactionAuthorizationRequests, transactions, transferPinAuthorizations, transferQuotes, users, userProfiles, userStatusChanges, withdrawalAuthorizationAttempts, withdrawalAuthorizationCodes, withdrawalRequests } from "./db/schema";
import { hasPermission } from "./auth/permissions";
import { userUi } from "./i18n/user-ui";

const authCookies = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    delete: (name: string) => authCookies.delete(name),
    get: (name: string) => authCookies.has(name) ? { name, value: authCookies.get(name)! } : undefined,
    set: (name: string, value: string) => authCookies.set(name, value),
  })),
}));

const directory = join(tmpdir(), `Citizavrexo-${process.pid}`);
const databasePath = join(directory, "integration.db");
let sqlite: Database.Database;
let database: ReturnType<typeof drizzle>;
const unsupportedCurrency = String.fromCharCode(69, 85, 82) as "USD";

beforeAll(async () => {
  mkdirSync(directory, { recursive: true });
  process.env.DATABASE_URL = databasePath;
  process.env.PROFILE_IMAGE_DIR = join(directory, "profile-images");
  process.env.RECOVERY_CODE_PEPPER = "test-only-recovery-pepper-at-least-32-characters";
  sqlite = new Database(databasePath);
  database = drizzle(sqlite);
  migrate(database, { migrationsFolder: resolve("drizzle") });
  const now = new Date().toISOString();
  database.insert(users).values({ id: "test-user", name: "Test User", email: "test@example.test", avatarInitials: "TU", status: "active", locale: "en", createdAt: now, updatedAt: now }).run();
  database.insert(users).values({ id: "admin-reviewer", name: "Admin Reviewer", email: "admin@example.test", avatarInitials: "AR", status: "active", locale: "en", adminRole: "administrator", createdAt: now, updatedAt: now }).run();
  database.insert(credentials).values({ userId: "test-user", passwordHash: "integration-password-hash", passwordChangedAt: now }).run();
  database.insert(accounts).values({ id: "test-account", userId: "test-user", name: "Personal Account", number: "1000000001", type: "personal", currency: "USD", balanceMinor: 10000, status: "active", createdAt: now, updatedAt: now }).run();
  database.insert(bankDestinations).values({ id: "test-destination", userId: "test-user", label: "Primary bank", bankName: "Test Bank", accountName: "Test User", accountNumber: "0123456789", currency: "USD", createdAt: now, updatedAt: now }).run();
});

afterEach(() => vi.unstubAllEnvs());

afterAll(() => {
  return import("./db/client").then(({ closeDatabaseConnection }) => {
    closeDatabaseConnection();
    sqlite.close();
    if (existsSync(directory)) rmSync(directory, { recursive: true, force: true });
  });
});

describe("runtime prerequisites", () => {
  it("loads better-sqlite3 and executes a real query", () => {
    const row = sqlite.prepare("SELECT 41 + 1 AS result").get() as { result: number };
    expect(row.result).toBe(42);
  });
});

describe("server-owned ledger", () => {
  it("derives and persists balances, transaction history, notification, and audit atomically", async () => {
    const { recordLedgerEntry } = await import("./transactions/ledger-service");
    const reference = await recordLedgerEntry({ idempotencyKey: "ledger-credit-0001", accountId: "test-account", amountMinor: 2500, currency: "USD", type: "credit", description: "Integration credit", status: "completed", actorId: "system", actorLabel: "System" });
    const account = database.select().from(accounts).where(eq(accounts.id, "test-account")).get();
    const transaction = database.select().from(transactions).where(eq(transactions.reference, reference)).get();
    expect(account?.balanceMinor).toBe(12500);
    expect(transaction).toMatchObject({ balanceBeforeMinor: 10000, balanceAfterMinor: 12500, amountMinor: 2500 });
    expect(database.select().from(notifications).where(eq(notifications.eventReference, reference)).get()).toBeTruthy();
    expect(database.select().from(auditEvents).where(eq(auditEvents.target, reference)).get()?.action).toBe("transaction.create");
  });

  it("rolls back an invalid overdraft without creating history", async () => {
    const { recordLedgerEntry } = await import("./transactions/ledger-service");
    await expect(recordLedgerEntry({ idempotencyKey: "ledger-overdraft-0001", accountId: "test-account", amountMinor: -999999, currency: "USD", type: "debit", description: "Invalid debit", status: "completed", actorId: "system", actorLabel: "System" })).rejects.toThrow("Insufficient");
    expect(database.select().from(accounts).where(eq(accounts.id, "test-account")).get()?.balanceMinor).toBe(12500);
  });

  it.each([
    { amountMinor: 100, type: "credit" as const, status: "pending" as const },
    { amountMinor: -100, type: "credit" as const, status: "completed" as const },
    { amountMinor: 100, type: "debit" as const, status: "completed" as const },
  ])("rejects entries whose status or direction cannot affect balances", async ({ amountMinor, type, status }) => {
    const { recordLedgerEntry } = await import("./transactions/ledger-service");
    const transactionCount = database.select().from(transactions).all().length;
    await expect(recordLedgerEntry({ idempotencyKey: `ledger-invalid-${amountMinor}-${type}-${status}`, accountId: "test-account", amountMinor, currency: "USD", type, description: "Invalid entry", status, actorId: "system", actorLabel: "System" })).rejects.toThrow();
    expect(database.select().from(accounts).where(eq(accounts.id, "test-account")).get()?.balanceMinor).toBe(12500);
    expect(database.select().from(transactions).all()).toHaveLength(transactionCount);
  });

  it("rejects balances outside JavaScript's safe integer range without partial writes", async () => {
    const { recordLedgerEntry } = await import("./transactions/ledger-service");
    database.update(accounts).set({ balanceMinor: Number.MAX_SAFE_INTEGER }).where(eq(accounts.id, "test-account")).run();
    const transactionCount = database.select().from(transactions).all().length;
    await expect(recordLedgerEntry({ idempotencyKey: "ledger-overflow-0001", accountId: "test-account", amountMinor: 1, currency: "USD", type: "credit", description: "Overflow", status: "completed", actorId: "system", actorLabel: "System" })).rejects.toThrow("supported range");
    expect(database.select().from(transactions).all()).toHaveLength(transactionCount);
    database.update(accounts).set({ balanceMinor: 12500 }).where(eq(accounts.id, "test-account")).run();
  });

  it("returns the original reference for an identical retry and rejects conflicting reuse", async () => {
    const { recordLedgerEntry } = await import("./transactions/ledger-service");
    const input = { idempotencyKey: "ledger-retry-0001", accountId: "test-account", amountMinor: 500, currency: "USD" as const, type: "credit" as const, description: "Retry-safe credit", status: "completed" as const, actorId: "system", actorLabel: "System" };
    const first = await recordLedgerEntry(input);
    const second = await recordLedgerEntry(input);
    expect(second).toBe(first);
    expect(database.select().from(accounts).where(eq(accounts.id, "test-account")).get()?.balanceMinor).toBe(13000);
    expect(database.select().from(transactions).where(eq(transactions.idempotencyKey, input.idempotencyKey)).all()).toHaveLength(1);
    await expect(recordLedgerEntry({ ...input, amountMinor: 600 })).rejects.toThrow("different transaction");
  });
});

describe("recovery and permissions", () => {
  it("stores only keyed hashes, invalidates old batches, and consumes codes once", async () => {
    const { consumeRecoveryCode, rotateRecoveryCodes } = await import("./security/recovery-code-service");
    const first = await rotateRecoveryCodes("test-user", "test@example.test", 2);
    const stored = database.select().from(recoveryCodes).where(eq(recoveryCodes.userId, "test-user")).all();
    expect(stored).toHaveLength(2);
    expect(stored.some((row) => first.includes(row.codeHash))).toBe(false);
    const second = await rotateRecoveryCodes("test-user", "test@example.test", 1);
    expect(await consumeRecoveryCode("test-user", first[0])).toBe(false);
    expect(await consumeRecoveryCode("test-user", second[0])).toBe(true);
    expect(await consumeRecoveryCode("test-user", second[0])).toBe(false);
  });

  it("allows exactly one concurrent consumer for a recovery code", async () => {
    const { consumeRecoveryCode, rotateRecoveryCodes } = await import("./security/recovery-code-service");
    const [code] = await rotateRecoveryCodes("test-user", "test@example.test", 1);
    const results = await Promise.all([consumeRecoveryCode("test-user", code), consumeRecoveryCode("test-user", code)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("does not grant support agents super-admin permissions", () => {
    expect(hasPermission("support_agent", "recovery.review")).toBe(true);
    expect(hasPermission("support_agent", "settings.manage")).toBe(false);
    expect(hasPermission("support_agent", "withdrawals.review")).toBe(false);
    expect(hasPermission("administrator", "withdrawals.review")).toBe(true);
    expect(hasPermission("auditor", "users.suspend")).toBe(false);
    expect(hasPermission("super_admin", "settings.manage")).toBe(true);
  });

  it("does not serialize audit records for roles without audit permission", async () => {
    const { getAdminWorkspace } = await import("./repositories/workspace-repository");
    database.insert(auditEvents).values({ id: "AUD-role-visibility", actorId: "admin-reviewer", actorLabel: "admin@example.test", action: "test.audit.visibility", target: "test-user", result: "success", metadataJson: "{}", timestamp: new Date().toISOString() }).onConflictDoNothing().run();
    expect((await getAdminWorkspace("support_agent")).auditEvents).toEqual([]);
    expect((await getAdminWorkspace("super_admin")).auditEvents.length).toBeGreaterThan(0);
  });

  it("filters admin workspace datasets for every configured role", async () => {
    const { getAdminWorkspace } = await import("./repositories/workspace-repository");
    const now = new Date().toISOString();
    database.insert(transactions).values({ id: "TX-role-visibility", reference: "NVT-role-visibility", idempotencyKey: "role-visibility", accountId: "test-account", type: "credit", description: "Role visibility fixture", amountMinor: 1, currency: "USD", occurredAt: now, status: "completed", balanceBeforeMinor: 10_000, balanceAfterMinor: 10_001, createdBy: "system", createdAt: now }).onConflictDoNothing().run();
    const superAdmin = await getAdminWorkspace("super_admin");
    const administrator = await getAdminWorkspace("administrator");
    const support = await getAdminWorkspace("support_agent");
    const auditor = await getAdminWorkspace("auditor");
    expect(superAdmin.users.length).toBeGreaterThan(0);
    expect(administrator.accounts.length).toBeGreaterThan(0);
    expect(support.transactions.length).toBeGreaterThan(0);
    expect(support.notifications).toEqual([]);
    expect(support.auditEvents).toEqual([]);
    expect(auditor.users.length).toBeGreaterThan(0);
    expect(auditor.notifications).toEqual([]);
    expect(auditor.auditEvents.length).toBeGreaterThan(0);
  });
});

describe("session, outbox, and audit integrity", () => {
  it("changes card status only for its owning user and records the change", async () => {
    const now = new Date().toISOString();
    database.insert(cards).values({ id: "test-card", accountId: "test-account", label: "Test card", lastFour: "1234", expires: "12/30", status: "active", monthlyLimitMinor: 10000, monthlySpentMinor: 0, onlinePayments: true, contactlessPayments: true, createdAt: now, updatedAt: now }).run();
    const { toggleOwnedCardFreeze } = await import("./security/card-service");
    expect(toggleOwnedCardFreeze("another-user", "other@example.test", "test-card")).toBeNull();
    expect(database.select().from(cards).where(eq(cards.id, "test-card")).get()?.status).toBe("active");
    expect(toggleOwnedCardFreeze("test-user", "test@example.test", "test-card")).toBe("frozen");
    expect(database.select().from(cards).where(eq(cards.id, "test-card")).get()?.status).toBe("frozen");
    expect(database.select().from(auditEvents).where(eq(auditEvents.target, "test-card")).get()?.action).toBe("card.frozen");
  });

  it("persists card capabilities only for the owning user", async () => {
    const now = new Date().toISOString();
    database.insert(cards).values({ id: "capability-card", accountId: "test-account", label: "Capability card", lastFour: "5678", expires: "12/30", status: "active", monthlyLimitMinor: 10000, monthlySpentMinor: 0, onlinePayments: true, contactlessPayments: false, createdAt: now, updatedAt: now }).run();
    const { toggleOwnedCardCapability } = await import("./security/card-service");
    expect(toggleOwnedCardCapability("another-user", "other@example.test", "capability-card", "onlinePayments")).toBeNull();
    expect(toggleOwnedCardCapability("test-user", "test@example.test", "capability-card", "onlinePayments")).toBe(false);
    expect(toggleOwnedCardCapability("test-user", "test@example.test", "capability-card", "contactlessPayments")).toBe(true);
    const card = database.select().from(cards).where(eq(cards.id, "capability-card")).get();
    expect(card?.onlinePayments).toBe(false);
    expect(card?.contactlessPayments).toBe(true);
  });

  it("revokes only an owned device and its linked session", async () => {
    const now = new Date().toISOString();
    database.insert(sessions).values({ id: "linked-session", userId: "test-user", tokenHash: "linked-token-hash", expiresAt: "2099-01-01T00:00:00Z", lastActiveAt: now, createdAt: now }).run();
    database.insert(devices).values({ id: "linked-device", userId: "test-user", sessionId: "linked-session", name: "Test device", browser: "Test browser", location: "Test location", lastActiveAt: now, loginAt: now, trusted: true }).run();
    const { revokeOwnedDevice } = await import("./security/device-service");
    expect(revokeOwnedDevice("another-user", "other@example.test", "linked-device")).toBe(false);
    expect(database.select().from(sessions).where(eq(sessions.id, "linked-session")).get()?.revokedAt).toBeNull();
    expect(revokeOwnedDevice("test-user", "test@example.test", "linked-device")).toBe(true);
    expect(database.select().from(devices).where(eq(devices.id, "linked-device")).get()?.revokedAt).toBeTruthy();
    expect(database.select().from(sessions).where(eq(sessions.id, "linked-session")).get()?.revokedAt).toBeTruthy();
  });

  it("allows only one worker to deliver an outbox record", async () => {
    const { deliverQueuedEmail, queueEmail } = await import("./notifications/outbox-service");
    const send = vi.fn(async () => undefined);
    const id = await queueEmail({ to: "test@example.test", locale: "en", event: "security_alert", eventReference: "SEC-TEST", displayName: "Test User", summary: "A security event occurred." });
    await Promise.all([deliverQueuedEmail(id, { send }), deliverQueuedEmail(id, { send })]);
    expect(send).toHaveBeenCalledOnce();
    expect(database.select().from(emailOutbox).where(eq(emailOutbox.id, id)).get()).toMatchObject({ status: "sent", attempts: 1, lockedAt: null });
  });

  it("rejects a malformed stored email payload before transport delivery", async () => {
    const id = "invalid-outbox";
    database.insert(emailOutbox).values({ id, recipient: "test@example.test", event: "security_alert", eventReference: "SEC-BAD", payloadJson: JSON.stringify({ to: "attacker@example.test", event: "not_an_event", token: "secret" }), status: "pending", createdAt: new Date().toISOString() }).run();
    const send = vi.fn(async () => undefined);
    const { deliverQueuedEmail } = await import("./notifications/outbox-service");
    await expect(deliverQueuedEmail(id, { send })).rejects.toThrow("Transactional email delivery failed");
    expect(send).not.toHaveBeenCalled();
    expect(database.select().from(emailOutbox).where(eq(emailOutbox.id, id)).get()).toMatchObject({ status: "failed", attempts: 1, lastError: "Transactional email delivery failed." });
    expect(database.select().from(emailOutbox).where(eq(emailOutbox.id, id)).get()?.nextAttemptAt).toBeTruthy();
  });

  it("redacts provider failures and delays retries", async () => {
    const { deliverQueuedEmail, queueEmail } = await import("./notifications/outbox-service");
    const send = vi.fn(async () => { throw new Error("provider-secret-detail"); });
    const id = await queueEmail({ to: "retry@example.test", locale: "en", event: "security_alert", eventReference: "SEC-RETRY", displayName: "Retry User", summary: "A security event occurred." });

    await expect(deliverQueuedEmail(id, { send })).rejects.toThrow("Transactional email delivery failed");
    expect(database.select().from(emailOutbox).where(eq(emailOutbox.id, id)).get()).toMatchObject({ status: "failed", attempts: 1, lastError: "Transactional email delivery failed." });
    await deliverQueuedEmail(id, { send });
    expect(send).toHaveBeenCalledOnce();
    expect(JSON.stringify(database.select().from(emailOutbox).where(eq(emailOutbox.id, id)).get())).not.toContain("provider-secret-detail");
  });

  it("recovers an abandoned worker claim without duplicate delivery", async () => {
    const { deliverQueuedEmail, queueEmail } = await import("./notifications/outbox-service");
    const send = vi.fn(async () => undefined);
    const id = await queueEmail({ to: "stale@example.test", locale: "en", event: "security_alert", eventReference: "SEC-STALE", displayName: "Stale User", summary: "A security event occurred." });
    database.update(emailOutbox).set({ status: "processing", lockedAt: "2000-01-01T00:00:00.000Z" }).where(eq(emailOutbox.id, id)).run();

    await deliverQueuedEmail(id, { send });
    await deliverQueuedEmail(id, { send });
    expect(send).toHaveBeenCalledOnce();
    expect(database.select().from(emailOutbox).where(eq(emailOutbox.id, id)).get()).toMatchObject({ status: "sent", attempts: 1, lockedAt: null });
  });

  it("prevents audit records from being updated or deleted", () => {
    const event = database.select().from(auditEvents).get();
    expect(event).toBeTruthy();
    expect(() => database.update(auditEvents).set({ action: "forged" }).where(eq(auditEvents.id, event!.id)).run()).toThrow("immutable");
    expect(() => database.delete(auditEvents).where(eq(auditEvents.id, event!.id)).run()).toThrow("immutable");
  });

  it("refuses to run development seeding in production", async () => {
    const { assertDevelopmentSeedEnvironment } = await import("./db/seed-guard");
    expect(() => assertDevelopmentSeedEnvironment("production")).toThrow("disabled in production");
    expect(() => assertDevelopmentSeedEnvironment("development")).not.toThrow();
  });
});

describe("authentication abuse controls", () => {
  it("persists hashed rate-limit keys and blocks attempts until the window resets", async () => {
    const { consumeAuthRateLimit } = await import("./auth/rate-limit-service");
    const email = "rate-limit@example.test";
    const now = Date.parse("2026-09-11T12:00:00Z");
    for (let attempt = 0; attempt < 10; attempt += 1) expect(consumeAuthRateLimit("login", email, now)).toBe(true);
    expect(consumeAuthRateLimit("login", email, now)).toBe(false);
    const stored = database.select().from(authRateLimits).all().find((row) => row.key.startsWith("login:"));
    expect(stored?.key).not.toContain(email);
    expect(consumeAuthRateLimit("login", email, now + 16 * 60 * 1000)).toBe(true);
  });

  it("limits administrator message sends to ten attempts per hour", async () => {
    const { consumeAuthRateLimit } = await import("./auth/rate-limit-service");
    const now = Date.parse("2026-09-11T12:00:00Z");
    for (let attempt = 0; attempt < 10; attempt += 1) expect(consumeAuthRateLimit("admin_message", "rate-limited-admin", now)).toBe(true);
    expect(consumeAuthRateLimit("admin_message", "rate-limited-admin", now)).toBe(false);
    expect(consumeAuthRateLimit("admin_message", "rate-limited-admin", now + 61 * 60 * 1000)).toBe(true);
  });

  it("limits admin-sensitive mutation bursts per actor and resets after the window", async () => {
    const { consumeAuthRateLimit } = await import("./auth/rate-limit-service");
    const now = Date.parse("2026-09-11T13:00:00Z");
    for (let attempt = 0; attempt < 30; attempt += 1) expect(consumeAuthRateLimit("admin_sensitive", "admin-user:withdrawals.review", now)).toBe(true);
    expect(consumeAuthRateLimit("admin_sensitive", "admin-user:withdrawals.review", now)).toBe(false);
    expect(consumeAuthRateLimit("admin_sensitive", "admin-user:withdrawals.review", now + 61 * 60 * 1000)).toBe(true);
  });

  it("tracks transaction PIN failures across sessions and expires lockout windows", async () => {
    const { consumeAuthRateLimit } = await import("./auth/rate-limit-service");
    const now = Date.parse("2026-09-11T14:00:00Z");
    const userId = "test-user";
    for (let attempt = 0; attempt < 5; attempt += 1) expect(consumeAuthRateLimit("transaction_pin", userId, now)).toBe(true);
    expect(consumeAuthRateLimit("transaction_pin", userId, now)).toBe(false);
    const stored = database.select().from(authRateLimits).all().find((row) => row.key.startsWith("transaction_pin:"));
    expect(stored?.attempts).toBe(5);
    expect(consumeAuthRateLimit("transaction_pin", userId, now + 16 * 60 * 1000)).toBe(true);
  });

  it("applies withdrawal authorization limits per request and user across sessions", async () => {
    const { consumeAuthRateLimit } = await import("./auth/rate-limit-service");
    const now = Date.parse("2026-09-11T15:00:00Z");
    const identifier = "request-123:withdrawal_code:test-user";
    for (let attempt = 0; attempt < 10; attempt += 1) expect(consumeAuthRateLimit("withdrawal_authorization", identifier, now)).toBe(true);
    expect(consumeAuthRateLimit("withdrawal_authorization", identifier, now)).toBe(false);
    expect(consumeAuthRateLimit("withdrawal_authorization", identifier, now + 16 * 60 * 1000)).toBe(true);
  });

  it("rejects production registration without email delivery configuration", async () => {
    const { registerUser } = await import("./auth/auth-service");
    const tables = [users, credentials, accounts, authenticationTokens, emailOutbox, auditEvents, sessions, devices] as const;
    const countsBefore = tables.map((table) => database.select().from(table).all().length);
    vi.stubEnv("NODE_ENV", "production");
    await expect(registerUser(
      { name: "Production Test", username: "production.test", email: "production-registration@example.test", password: "TestPassword!2026", pin: "2468", locale: "en", currency: "USD" },
      { ipAddress: "203.0.113.12", userAgent: "Production Registration Browser" },
    )).rejects.toThrow("Transactional email delivery is unavailable.");

    expect(database.select().from(users).where(eq(users.email, "production-registration@example.test")).get()).toBeUndefined();
    expect(tables.map((table, index) => database.select().from(table).all().length - countsBefore[index])).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });
});

describe("profile review lifecycle", () => {
  const profileValues = { legalName: "Profile Customer", dateOfBirth: "1990-01-01", residentialAddress: "10 Profile Street", city: "Tokyo", stateProvince: "Tokyo", country: "JP", postalCode: "100-0001", phoneNumber: "+81312345678" };

  beforeAll(() => {
    const now = new Date().toISOString();
    database.insert(users).values([
      { id: "profile-customer", name: "Profile Customer", email: "profile@example.test", avatarInitials: "PC", status: "active", locale: "ja", createdAt: now, updatedAt: now },
      { id: "profile-admin", name: "Profile Admin", email: "profile-admin@example.test", avatarInitials: "PA", status: "active", locale: "en", adminRole: "administrator", createdAt: now, updatedAt: now },
    ]).run();
  });

  it("submits, approves, and preserves a separate card lifecycle", async () => {
    const { reviewUserProfile, saveUserProfile } = await import("./users/profile-service");
    expect(saveUserProfile("profile-customer", profileValues)).toMatchObject({ complete: true, reviewStatus: "pending_review" });
    expect(database.select().from(userProfiles).where(eq(userProfiles.userId, "profile-customer")).get()).toMatchObject({ ...profileValues, reviewStatus: "pending_review", reviewedBy: null, reviewedAt: null });
    expect(database.select().from(notifications).where(and(eq(notifications.userId, "profile-customer"), eq(notifications.title, userUi("ja").profileCompletion.submittedMessage))).get()).toBeTruthy();
    const submittedEmail = database.select().from(emailOutbox).where(eq(emailOutbox.recipient, "profile@example.test")).all().find((row) => row.eventReference.includes("submitted"));
    expect(JSON.parse(submittedEmail!.payloadJson)).toMatchObject({ locale: "ja" });
    expect(() => reviewUserProfile({ actorId: "support", actorLabel: "support@example.test", actorRole: "support_agent", userId: "profile-customer", decision: "approved" })).toThrow("not permitted");
    reviewUserProfile({ actorId: "profile-admin", actorLabel: "profile-admin@example.test", actorRole: "administrator", userId: "profile-customer", decision: "approved" });
    const approved = database.select().from(userProfiles).where(eq(userProfiles.userId, "profile-customer")).get();
    expect(approved).toMatchObject({ reviewStatus: "approved", reviewedBy: "profile-admin", rejectionReason: null });
    expect(approved?.reviewedAt).toBeTruthy();
    expect(database.select().from(cardRequests).where(eq(cardRequests.userId, "profile-customer")).all()).toHaveLength(0);
    expect(database.select().from(cards).all().filter((card) => card.accountId === "profile-customer")).toHaveLength(0);
    expect(database.select().from(auditEvents).where(and(eq(auditEvents.target, "profile-customer"), eq(auditEvents.action, "profile.approved"))).get()).toBeTruthy();
  });

  it("records rejection details and allows correction and resubmission", async () => {
    const { reviewUserProfile, saveUserProfile } = await import("./users/profile-service");
    saveUserProfile("profile-customer", { ...profileValues, city: "Kyoto" });
    reviewUserProfile({ actorId: "profile-admin", actorLabel: "profile-admin@example.test", actorRole: "administrator", userId: "profile-customer", decision: "rejected", rejectionReason: "Please verify your residential address." });
    expect(database.select().from(userProfiles).where(eq(userProfiles.userId, "profile-customer")).get()).toMatchObject({ reviewStatus: "rejected", reviewedBy: "profile-admin", rejectionReason: "Please verify your residential address." });
    expect(saveUserProfile("profile-customer", { ...profileValues, city: "Osaka" })).toMatchObject({ reviewStatus: "pending_review", city: "Osaka" });
    expect(database.select().from(userProfiles).where(eq(userProfiles.userId, "profile-customer")).get()).toMatchObject({ reviewStatus: "pending_review", reviewedBy: null, reviewedAt: null, rejectionReason: null, city: "Osaka" });
  });

  it("reports the exact invalid profile field without persisting a partial profile", async () => {
    const { getUserProfile, saveUserProfile } = await import("./users/profile-service");
    expect(() => saveUserProfile("profile-customer", { ...profileValues, phoneNumber: "0812345678" })).toThrow(expect.objectContaining({
      fieldErrors: { phoneNumber: "Enter a phone number in international format, for example +14155552671." },
    }));
    expect(getUserProfile("profile-customer")).toMatchObject({ city: "Osaka", phoneNumber: profileValues.phoneNumber });
  });
});

describe("physical card requests", () => {
  beforeAll(() => {
    database.insert(userProfiles).values({ userId: "test-user", legalName: "Test User", dateOfBirth: "1990-01-01", residentialAddress: "1 Test Street", city: "Lagos", stateProvince: "Lagos", country: "NG", postalCode: "100001", phoneNumber: "+2348000000000", reviewStatus: "approved", updatedAt: new Date().toISOString() }).run();
  });

  it("rejects an incomplete profile without creating request side effects", async () => {
    const now = new Date().toISOString();
    database.insert(users).values({ id: "incomplete-card-user", name: "Incomplete User", email: "incomplete-card@example.test", avatarInitials: "IU", status: "active", locale: "en", createdAt: now, updatedAt: now }).run();
    database.insert(accounts).values({ id: "incomplete-card-account", userId: "incomplete-card-user", name: "Personal Account", number: "1000000003", type: "personal", currency: "USD", balanceMinor: 0, status: "active", createdAt: now, updatedAt: now }).run();
    const { createCardRequest } = await import("./cards/card-request-service");
    const before = [cardRequests, notifications, emailOutbox, auditEvents].map((table) => database.select().from(table).all().length);
    expect(() => createCardRequest({ userId: "incomplete-card-user", actorLabel: "incomplete-card@example.test", accountId: "incomplete-card-account", label: "Everyday card", monthlyLimitMinor: 50_000 })).toThrow("profile must be approved");
    expect([cardRequests, notifications, emailOutbox, auditEvents].map((table) => database.select().from(table).all().length)).toEqual(before);
  });

  it("creates one owned pending request with notification and audit records", async () => {
    const { createCardRequest } = await import("./cards/card-request-service");
    const requestId = createCardRequest({ userId: "test-user", actorLabel: "test@example.test", accountId: "test-account", label: "Everyday card", monthlyLimitMinor: 50_000 });
    expect(database.select().from(cardRequests).where(eq(cardRequests.id, requestId)).get()).toMatchObject({ userId: "test-user", accountId: "test-account", status: "pending" });
    expect(database.select().from(notifications).where(and(eq(notifications.userId, "test-user"), eq(notifications.title, "Physical card request submitted"))).get()).toBeTruthy();
    expect(database.select().from(emailOutbox).all().some((row) => row.eventReference.endsWith(":submitted"))).toBe(true);
    expect(database.select().from(auditEvents).where(eq(auditEvents.target, requestId)).get()?.action).toBe("card_request.create");
    expect(() => createCardRequest({ userId: "test-user", actorLabel: "test@example.test", accountId: "test-account", label: "Another card", monthlyLimitMinor: 50_000 })).toThrow("already pending");
  });

  it("applies major-unit card limits and preserves the account currency", async () => {
    const now = new Date().toISOString();
    database.insert(users).values({ id: "kwd-card-user", name: "KWD Card User", email: "kwd-card@example.test", avatarInitials: "KC", status: "active", locale: "en", createdAt: now, updatedAt: now }).run();
    database.insert(accounts).values({ id: "kwd-card-account", userId: "kwd-card-user", name: "KWD Account", number: "1000000004", type: "personal", currency: "KWD", balanceMinor: 0, status: "active", createdAt: now, updatedAt: now }).run();
    database.insert(userProfiles).values({ userId: "kwd-card-user", legalName: "KWD Card User", dateOfBirth: "1990-01-01", residentialAddress: "3 Test Street", city: "Kuwait City", stateProvince: "Al Asimah", country: "KW", postalCode: "13001", phoneNumber: "+96550000000", reviewStatus: "approved", updatedAt: now }).run();
    const { createCardRequest } = await import("./cards/card-request-service");
    expect(() => createCardRequest({ userId: "kwd-card-user", actorLabel: "kwd-card@example.test", accountId: "kwd-card-account", label: "KWD card", monthlyLimitMinor: 99_999 })).toThrow("between 100 and 1,000,000");
    const requestId = createCardRequest({ userId: "kwd-card-user", actorLabel: "kwd-card@example.test", accountId: "kwd-card-account", label: "KWD card", monthlyLimitMinor: 100_000 });
    expect(database.select().from(cardRequests).where(eq(cardRequests.id, requestId)).get()).toMatchObject({ currency: "KWD", monthlyLimitMinor: 100_000 });
  });

  it("enforces ownership and review permission, then approves exactly once", async () => {
    const { createCardRequest, reviewCardRequest } = await import("./cards/card-request-service");
    expect(() => createCardRequest({ userId: "another-user", actorLabel: "other@example.test", accountId: "test-account", label: "Other card", monthlyLimitMinor: 50_000 })).toThrow("not eligible");
    const request = database.select().from(cardRequests).where(and(eq(cardRequests.userId, "test-user"), eq(cardRequests.status, "pending"))).get();
    expect(request).toBeTruthy();
    expect(() => reviewCardRequest({ actorId: "support", actorLabel: "support@example.test", actorRole: "support_agent", requestId: request!.id, decision: "approved" })).toThrow("not permitted");
    expect(() => reviewCardRequest({ actorId: "test-user", actorLabel: "test@example.test", actorRole: "administrator", requestId: request!.id, decision: "approved" })).toThrow("own card requests");
    const approved = reviewCardRequest({ actorId: "admin-reviewer", actorLabel: "admin@example.test", actorRole: "administrator", requestId: request!.id, decision: "approved" });
    expect(approved.cardId).toBeTruthy();
    expect(database.select().from(cards).where(eq(cards.id, approved.cardId!)).get()).toMatchObject({ accountId: "test-account", label: "Everyday card", status: "active" });
    expect(database.select().from(cardRequests).where(eq(cardRequests.id, request!.id)).get()).toMatchObject({ status: "approved", cardId: approved.cardId });
    const count = database.select().from(cards).all().length;
    expect(() => reviewCardRequest({ actorId: "admin-reviewer", actorLabel: "admin@example.test", actorRole: "administrator", requestId: request!.id, decision: "approved" })).toThrow("no longer available");
    expect(database.select().from(cards).all()).toHaveLength(count);
    expect(database.select().from(emailOutbox).all().some((row) => row.eventReference.startsWith("NCR-") && row.eventReference.endsWith(":approved"))).toBe(true);
    expect(database.select().from(auditEvents).where(eq(auditEvents.target, request!.id)).all().some((row) => row.action === "card_request.approved")).toBe(true);
  });

  it("rejects a pending request without creating a card", async () => {
    const now = new Date().toISOString();
    database.insert(users).values({ id: "rejected-user", name: "Rejected User", email: "rejected@example.test", avatarInitials: "RU", status: "active", locale: "en", createdAt: now, updatedAt: now }).run();
    database.insert(accounts).values({ id: "rejected-account", userId: "rejected-user", name: "Personal Account", number: "1000000002", type: "personal", currency: "USD", balanceMinor: 0, status: "active", createdAt: now, updatedAt: now }).run();
    database.insert(userProfiles).values({ userId: "rejected-user", legalName: "Rejected User", dateOfBirth: "1990-01-01", residentialAddress: "2 Test Street", city: "Lagos", stateProvince: "Lagos", country: "NG", postalCode: "100001", phoneNumber: "+2348000000001", reviewStatus: "approved", updatedAt: now }).run();
    const { createCardRequest, reviewCardRequest } = await import("./cards/card-request-service");
    const requestId = createCardRequest({ userId: "rejected-user", actorLabel: "rejected@example.test", accountId: "rejected-account", label: "Reserve card", monthlyLimitMinor: 30_000 });
    const before = database.select().from(cards).all().length;
    expect(reviewCardRequest({ actorId: "admin-reviewer", actorLabel: "admin@example.test", actorRole: "administrator", requestId, decision: "rejected", rejectionReason: "Eligibility requirements were not met." })).toEqual({});
    expect(database.select().from(cards).all()).toHaveLength(before);
    expect(database.select().from(cardRequests).where(eq(cardRequests.id, requestId)).get()).toMatchObject({ status: "rejected", rejectionReason: "Eligibility requirements were not met." });
    expect(database.select().from(notifications).where(and(eq(notifications.userId, "rejected-user"), eq(notifications.title, "Physical card request rejected"))).get()).toBeTruthy();
    expect(database.select().from(auditEvents).where(eq(auditEvents.target, requestId)).all().some((row) => row.action === "card_request.rejected")).toBe(true);
  });
});

describe("Citizavrexo-to-Citizavrexo transfers", () => {
  beforeAll(() => {
    const now = new Date().toISOString();
    database.insert(users).values([
      { id: "transfer-recipient", name: "Recipient User", email: "recipient@example.test", avatarInitials: "RU", status: "active", locale: "en", createdAt: now, updatedAt: now },
      { id: "transfer-other", name: "Other User", email: "other-transfer@example.test", avatarInitials: "OU", status: "active", locale: "en", createdAt: now, updatedAt: now },
    ]).run();
    database.insert(accounts).values([
      { id: "recipient-account", userId: "transfer-recipient", name: "Recipient Account", number: "1000001001", type: "personal", currency: "USD", balanceMinor: 2_000, status: "active", createdAt: now, updatedAt: now },
      { id: "recipient-usd", userId: "transfer-recipient", name: "Unsupported Currency Account", number: "1000001002", type: "personal", currency: unsupportedCurrency, balanceMinor: 2_000, status: "active", createdAt: now, updatedAt: now },
      { id: "recipient-inactive", userId: "transfer-recipient", name: "Inactive Account", number: "1000001003", type: "personal", currency: "USD", balanceMinor: 2_000, status: "suspended", createdAt: now, updatedAt: now },
      { id: "other-sender", userId: "transfer-other", name: "Other Account", number: "1000001004", type: "personal", currency: "USD", balanceMinor: 20_000, status: "active", createdAt: now, updatedAt: now },
      { id: "recipient-jpy", userId: "transfer-recipient", name: "JPY Account", number: "1000001005", type: "personal", currency: "JPY", balanceMinor: 0, status: "active", createdAt: now, updatedAt: now },
      { id: "recipient-kwd", userId: "transfer-recipient", name: "KWD Account", number: "1000001006", type: "personal", currency: "KWD", balanceMinor: 0, status: "active", createdAt: now, updatedAt: now },
    ]).run();
  });

  beforeEach(() => {
    database.delete(transactionAuthorizationAttempts).run();
    database.delete(transactionAuthorizationCodes).run();
    database.delete(transactionAuthorizationRequests).run();
    database.delete(transferPinAuthorizations).run();
    database.delete(authRateLimits).run();
    database.update(credentials).set({ transactionPinHash: null }).where(eq(credentials.userId, "test-user")).run();
    database.update(accounts).set({ balanceMinor: 20_000, status: "active" }).where(eq(accounts.id, "test-account")).run();
    database.update(accounts).set({ balanceMinor: 2_000, status: "active" }).where(eq(accounts.id, "recipient-account")).run();
    database.update(accounts).set({ balanceMinor: 2_000, status: "suspended" }).where(eq(accounts.id, "recipient-inactive")).run();
    database.update(accounts).set({ balanceMinor: 0, status: "active" }).where(eq(accounts.id, "recipient-jpy")).run();
    database.update(accounts).set({ balanceMinor: 0, status: "active" }).where(eq(accounts.id, "recipient-kwd")).run();
  });

  const insertQuote = (input: { id: string; userId?: string; senderAccountId?: string; recipientAccountId?: string; sourceAmountMinor: number; sourceCurrency?: "USD" | "EUR"; recipientAmountMinor?: number; recipientCurrency?: "USD" | "EUR"; expiresAt?: string }) => {
    const now = new Date();
    const userId = input.userId ?? "test-user";
    const expiresAt = input.expiresAt ?? new Date(now.getTime() + 300_000).toISOString();
    database.insert(transferQuotes).values({ id: input.id, userId, senderAccountId: input.senderAccountId ?? "test-account", recipientAccountId: input.recipientAccountId ?? "recipient-account", sourceAmountMinor: input.sourceAmountMinor, sourceCurrency: input.sourceCurrency ?? "USD", recipientAmountMinor: input.recipientAmountMinor ?? input.sourceAmountMinor, recipientCurrency: input.recipientCurrency ?? "USD", exchangeRate: input.sourceCurrency === "EUR" ? "1.08" : "1", rateDate: now.toISOString().slice(0, 10), rateTimestamp: now.toISOString(), rateProvider: input.sourceCurrency === input.recipientCurrency || (!input.sourceCurrency && !input.recipientCurrency) ? "same_currency" : "test_provider", expiresAt, createdAt: now.toISOString() }).run();
    database.insert(transferPinAuthorizations).values({ id: `${input.id}-pin`, userId, quoteId: input.id, expiresAt, createdAt: now.toISOString() }).run();
    return input.id;
  };
  const authorizeQuote = (quoteId: string) => {
    const quote = database.select().from(transferQuotes).where(eq(transferQuotes.id, quoteId)).get()!;
    database.insert(transferPinAuthorizations).values({ id: `${quoteId}-pin`, userId: quote.userId, quoteId, expiresAt: quote.expiresAt, createdAt: new Date().toISOString() }).run();
  };
  const authorizeTransaction = (quoteId: string, idempotencyKey: string, userId = "test-user") => {
    const quote = database.select().from(transferQuotes).where(eq(transferQuotes.id, quoteId)).get()!;
    const pinAuthorization = database.select().from(transferPinAuthorizations).where(eq(transferPinAuthorizations.quoteId, quoteId)).get()!;
    const requestId = `${quoteId}-authorization`;
    const now = new Date().toISOString();
    database.insert(transactionAuthorizationRequests).values({ id: requestId, reference: `NVA-${quoteId}`, userId, quoteId, pinAuthorizationId: pinAuthorization.id, idempotencyKey, senderAccountId: quote.senderAccountId, recipientAccountId: quote.recipientAccountId, sourceAmountMinor: quote.sourceAmountMinor, sourceCurrency: quote.sourceCurrency, recipientAmountMinor: quote.recipientAmountMinor, recipientCurrency: quote.recipientCurrency, exchangeRate: quote.exchangeRate, rateDate: quote.rateDate, rateTimestamp: quote.rateTimestamp, rateProvider: quote.rateProvider, status: "code_issued", requestedAt: now }).run();
    database.insert(transactionAuthorizationCodes).values({ id: `${requestId}-code`, requestId, userId, codeHash: `${requestId}-test-hash`, status: "verified", issuedBy: userId, issuedAt: now, expiresAt: quote.expiresAt, verifiedAt: now }).run();
    return requestId;
  };

  it("sets up an exactly four-digit PIN and stores only an Argon2 hash", async () => {
    const { verify } = await import("@node-rs/argon2");
    const { setUpTransactionPin } = await import("./security/transaction-pin-service");
    await expect(setUpTransactionPin({ userId: "test-user", actorLabel: "test@example.test", pin: "123", confirmation: "123" })).rejects.toThrow("exactly 4-digit");
    await setUpTransactionPin({ userId: "test-user", actorLabel: "test@example.test", pin: "2468", confirmation: "2468" });
    const stored = database.select().from(credentials).where(eq(credentials.userId, "test-user")).get()!.transactionPinHash!;
    expect(stored).not.toContain("2468");
    await expect(verify(stored, "2468")).resolves.toBe(true);
  });

  it("requires transaction PIN setup before transfer authorization", async () => {
    const { authorizeTransferWithPin } = await import("./security/transaction-pin-service");
    const { createTransferQuote } = await import("./transactions/transfer-service");
    const quote = await createTransferQuote({ userId: "test-user", senderAccountId: "test-account", recipientAccountNumber: "1000001001", amountMinor: 100 });
    await expect(authorizeTransferWithPin({ userId: "test-user", quoteId: quote.id, pin: "2468" })).rejects.toThrow("Set up a transaction PIN in Security before sending money.");
  });

  it("rejects wrong PINs and rate-limits the sixth failed attempt", async () => {
    const { authorizeTransferWithPin, setUpTransactionPin } = await import("./security/transaction-pin-service");
    const { createTransferQuote } = await import("./transactions/transfer-service");
    await setUpTransactionPin({ userId: "test-user", actorLabel: "test@example.test", pin: "2468", confirmation: "2468" });
    const quote = await createTransferQuote({ userId: "test-user", senderAccountId: "test-account", recipientAccountNumber: "1000001001", amountMinor: 100 });
    for (let attempt = 0; attempt < 5; attempt += 1) await expect(authorizeTransferWithPin({ userId: "test-user", quoteId: quote.id, pin: "1111" })).rejects.toThrow("incorrect");
    await expect(authorizeTransferWithPin({ userId: "test-user", quoteId: quote.id, pin: "1111" })).rejects.toThrow("Too many");
    expect(database.select().from(transferPinAuthorizations).where(eq(transferPinAuthorizations.quoteId, quote.id)).get()).toBeUndefined();
    const limiter = database.select().from(authRateLimits).all().find((row) => row.key.startsWith("transaction_pin:"));
    expect(limiter?.attempts).toBe(5);
  });

  it("requires an admin-issued code for the exact request and completes it once", async () => {
    const { issueTransactionAuthorizationCode, requestTransactionAuthorization, verifyTransactionAuthorizationCode } = await import("./transactions/transaction-authorization-service");
    const quoteId = insertQuote({ id: "quote-authorization-complete", sourceAmountMinor: 1_200 });
    const request = requestTransactionAuthorization({ userId: "test-user", actorLabel: "test@example.test", quoteId, pinAuthorizationId: `${quoteId}-pin`, idempotencyKey: "transfer-authorization-complete" });
    expect(database.select().from(accounts).where(eq(accounts.id, "test-account")).get()?.balanceMinor).toBe(20_000);
    expect(database.select().from(transactionAuthorizationRequests).where(eq(transactionAuthorizationRequests.id, request.requestId)).get()).toMatchObject({ status: "pending", sourceAmountMinor: 1_200 });

    const issued = issueTransactionAuthorizationCode({ actorId: "admin-reviewer", actorLabel: "admin@example.test", actorRole: "administrator", requestId: request.requestId, mode: "issue" });
    const storedCode = database.select().from(transactionAuthorizationCodes).where(eq(transactionAuthorizationCodes.requestId, request.requestId)).get()!;
    expect(storedCode.codeHash).not.toContain(issued.code);
    expect(database.select().from(notifications).where(eq(notifications.eventReference, `${request.reference}:code:${storedCode.id}`)).get()?.message).not.toContain(issued.code);
    expect(database.select().from(emailOutbox).where(eq(emailOutbox.eventReference, `${request.reference}:code:${storedCode.id}`)).get()?.payloadJson).toContain(issued.code);

    const completed = await verifyTransactionAuthorizationCode({ userId: "test-user", actorLabel: "test@example.test", requestId: request.requestId, code: issued.code });
    expect(completed.transferReference).toMatch(/^NVT-/);
    expect(database.select().from(transactionAuthorizationRequests).where(eq(transactionAuthorizationRequests.id, request.requestId)).get()).toMatchObject({ status: "completed", transferReference: completed.transferReference });
    expect(database.select().from(transactionAuthorizationAttempts).where(eq(transactionAuthorizationAttempts.requestId, request.requestId)).get()?.outcome).toBe("success");
    expect(database.select().from(accounts).where(eq(accounts.id, "test-account")).get()?.balanceMinor).toBe(18_800);
    await expect(verifyTransactionAuthorizationCode({ userId: "test-user", actorLabel: "test@example.test", requestId: request.requestId, code: issued.code })).rejects.toThrow("invalid or unavailable");
  });

  it("rejects another user and locks the code after five persisted failures", async () => {
    const { issueTransactionAuthorizationCode, requestTransactionAuthorization, verifyTransactionAuthorizationCode } = await import("./transactions/transaction-authorization-service");
    const quoteId = insertQuote({ id: "quote-authorization-lock", sourceAmountMinor: 300 });
    const request = requestTransactionAuthorization({ userId: "test-user", actorLabel: "test@example.test", quoteId, pinAuthorizationId: `${quoteId}-pin`, idempotencyKey: "transfer-authorization-lock" });
    const issued = issueTransactionAuthorizationCode({ actorId: "admin-reviewer", actorLabel: "admin@example.test", actorRole: "administrator", requestId: request.requestId, mode: "issue" });
    await expect(verifyTransactionAuthorizationCode({ userId: "transfer-other", actorLabel: "other-transfer@example.test", requestId: request.requestId, code: issued.code })).rejects.toThrow("invalid or unavailable");
    for (let attempt = 1; attempt <= 5; attempt += 1) await expect(verifyTransactionAuthorizationCode({ userId: "test-user", actorLabel: "test@example.test", requestId: request.requestId, code: "AAAA-BBBB" })).rejects.toThrow(attempt === 5 ? "Too many" : "invalid or expired");
    expect(database.select().from(transactionAuthorizationCodes).where(eq(transactionAuthorizationCodes.requestId, request.requestId)).get()).toMatchObject({ failedAttempts: 5 });
    expect(database.select().from(transactionAuthorizationAttempts).where(eq(transactionAuthorizationAttempts.requestId, request.requestId)).all()).toHaveLength(5);
    expect(database.select().from(accounts).where(eq(accounts.id, "test-account")).get()?.balanceMinor).toBe(20_000);
  });

  it("expires an issued transaction code without consuming the bound transfer", async () => {
    const { issueTransactionAuthorizationCode, requestTransactionAuthorization, verifyTransactionAuthorizationCode } = await import("./transactions/transaction-authorization-service");
    const now = new Date();
    const quoteId = insertQuote({ id: "quote-authorization-expired", sourceAmountMinor: 400 });
    const request = requestTransactionAuthorization({ userId: "test-user", actorLabel: "test@example.test", quoteId, pinAuthorizationId: `${quoteId}-pin`, idempotencyKey: "transfer-authorization-expired", now });
    const issued = issueTransactionAuthorizationCode({ actorId: "admin-reviewer", actorLabel: "admin@example.test", actorRole: "administrator", requestId: request.requestId, mode: "issue", now });
    await expect(verifyTransactionAuthorizationCode({ userId: "test-user", actorLabel: "test@example.test", requestId: request.requestId, code: issued.code, now: new Date(now.getTime() + 16 * 60_000) })).rejects.toThrow("expired");
    expect(database.select().from(transactionAuthorizationCodes).where(eq(transactionAuthorizationCodes.requestId, request.requestId)).get()?.status).toBe("expired");
    expect(database.select().from(transactionAuthorizationAttempts).where(eq(transactionAuthorizationAttempts.requestId, request.requestId)).get()?.outcome).toBe("expired");
    expect(database.select().from(transferQuotes).where(eq(transferQuotes.id, quoteId)).get()?.consumedAt).toBeNull();
  });

  it("retries the transfer safely after code verification succeeds but the ledger transaction rolls back", async () => {
    const { issueTransactionAuthorizationCode, requestTransactionAuthorization, verifyTransactionAuthorizationCode } = await import("./transactions/transaction-authorization-service");
    const quoteId = insertQuote({ id: "quote-authorization-retry", sourceAmountMinor: 500 });
    const request = requestTransactionAuthorization({ userId: "test-user", actorLabel: "test@example.test", quoteId, pinAuthorizationId: `${quoteId}-pin`, idempotencyKey: "transfer-authorization-retry" });
    const issued = issueTransactionAuthorizationCode({ actorId: "admin-reviewer", actorLabel: "admin@example.test", actorRole: "administrator", requestId: request.requestId, mode: "issue" });
    sqlite.exec("CREATE TRIGGER fail_authorized_transfer_notification BEFORE INSERT ON notifications WHEN NEW.title = 'Transfer completed' BEGIN SELECT RAISE(ABORT, 'forced authorized transfer failure'); END;");
    try {
      await expect(verifyTransactionAuthorizationCode({ userId: "test-user", actorLabel: "test@example.test", requestId: request.requestId, code: issued.code })).rejects.toThrow("forced authorized transfer failure");
    } finally {
      sqlite.exec("DROP TRIGGER fail_authorized_transfer_notification;");
    }
    expect(database.select().from(transactionAuthorizationCodes).where(eq(transactionAuthorizationCodes.requestId, request.requestId)).get()?.status).toBe("verified");
    const retried = await verifyTransactionAuthorizationCode({ userId: "test-user", actorLabel: "test@example.test", requestId: request.requestId, code: issued.code });
    expect(retried.transferReference).toMatch(/^NVT-/);
    expect(database.select().from(accounts).where(eq(accounts.id, "test-account")).get()?.balanceMinor).toBe(19_500);
  });

  it("binds one PIN authorization to one quote and prevents replay on changed details", async () => {
    const { authorizeTransferWithPin, setUpTransactionPin } = await import("./security/transaction-pin-service");
    const { createTransferQuote, transferBetweenUsers } = await import("./transactions/transfer-service");
    await setUpTransactionPin({ userId: "test-user", actorLabel: "test@example.test", pin: "2468", confirmation: "2468" });
    const intended = await createTransferQuote({ userId: "test-user", senderAccountId: "test-account", recipientAccountNumber: "1000001001", amountMinor: 100 });
    const changed = await createTransferQuote({ userId: "test-user", senderAccountId: "test-account", recipientAccountNumber: "1000001001", amountMinor: 200 });
    await authorizeTransferWithPin({ userId: "test-user", quoteId: intended.id, pin: "2468" });
    expect(() => transferBetweenUsers({ userId: "test-user", actorLabel: "test@example.test", quoteId: changed.id, idempotencyKey: "transfer-pin-changed-0001", authorizationRequestId: "missing" })).toThrow("authorization");
    expect(() => transferBetweenUsers({ userId: "test-user", actorLabel: "test@example.test", quoteId: intended.id, idempotencyKey: "transfer-pin-intended-0001", authorizationRequestId: "missing" })).toThrow("authorization");
  });

  it("changes a PIN only with the current PIN and invalidates outstanding authorizations", async () => {
    const { authorizeTransferWithPin, changeTransactionPin, setUpTransactionPin } = await import("./security/transaction-pin-service");
    const { createTransferQuote, transferBetweenUsers } = await import("./transactions/transfer-service");
    await setUpTransactionPin({ userId: "test-user", actorLabel: "test@example.test", pin: "2468", confirmation: "2468" });
    const quote = await createTransferQuote({ userId: "test-user", senderAccountId: "test-account", recipientAccountNumber: "1000001001", amountMinor: 100 });
    await authorizeTransferWithPin({ userId: "test-user", quoteId: quote.id, pin: "2468" });
    await expect(changeTransactionPin({ userId: "test-user", actorLabel: "test@example.test", currentPin: "1111", newPin: "1357", confirmation: "1357" })).rejects.toThrow("incorrect");
    await changeTransactionPin({ userId: "test-user", actorLabel: "test@example.test", currentPin: "2468", newPin: "1357", confirmation: "1357" });
    expect(database.select().from(transferPinAuthorizations).where(eq(transferPinAuthorizations.quoteId, quote.id)).get()).toBeUndefined();
    expect(() => transferBetweenUsers({ userId: "test-user", actorLabel: "test@example.test", quoteId: quote.id, idempotencyKey: "transfer-pin-change-0001", authorizationRequestId: "missing" })).toThrow("authorization");
    await expect(authorizeTransferWithPin({ userId: "test-user", quoteId: quote.id, pin: "2468" })).rejects.toThrow("incorrect");
    await expect(authorizeTransferWithPin({ userId: "test-user", quoteId: quote.id, pin: "1357" })).resolves.toBeTruthy();
  });

  it("looks up an eligible recipient without allowing nonexistent or self recipients", async () => {
    const { findTransferRecipient } = await import("./transactions/transfer-service");
    expect(findTransferRecipient("test-user", "test-account", "1000001001")).toMatchObject({ userName: "Recipient User", currency: "USD" });
    expect(() => findTransferRecipient("test-user", "test-account", "9999999999")).toThrow("No eligible recipient");
    expect(() => findTransferRecipient("test-user", "test-account", "1000000001")).toThrow("own account");
    expect(findTransferRecipient("test-user", "test-account", "1000001002")).toMatchObject({ userName: "Recipient User", currency: "EUR" });
  });

  it("creates a cross-currency quote from a provider snapshot without moving funds", async () => {
    const { createTransferQuote } = await import("./transactions/transfer-service");
    const provider = {
      id: "test_provider",
      getRate: vi.fn(async () => ({ fromCurrency: "USD" as const, toCurrency: "EUR" as const, rate: "0.925", effectiveDate: "2026-06-12", publishedAt: "2026-06-12T11:55:00.000Z", provider: "test_provider" })),
    };
    const quote = await createTransferQuote({ userId: "test-user", senderAccountId: "test-account", recipientAccountNumber: "1000001002", amountMinor: 3_500, provider, now: new Date("2026-06-12T12:00:00.000Z") });
    expect(quote).toMatchObject({ sourceAmount: 35, sourceCurrency: "USD", recipientAmount: 32.38, recipientCurrency: "EUR", exchangeRate: "0.925", rateProvider: "test_provider", maskedAccountNumber: "•••• 1002" });
    expect(quote.expiresAt).toBe("2026-06-12T12:05:00.000Z");
    expect(database.select().from(transferQuotes).where(eq(transferQuotes.id, quote.id)).get()).toMatchObject({ sourceAmountMinor: 3_500, recipientAmountMinor: 3_238, exchangeRate: "0.925", consumedAt: null });
    expect(database.select().from(accounts).where(eq(accounts.id, "test-account")).get()?.balanceMinor).toBe(20_000);
    expect(database.select().from(accounts).where(eq(accounts.id, "recipient-usd")).get()?.balanceMinor).toBe(2_000);
  });

  it("rejects stale, future, and invalidly configured rate timestamps without persisting quotes", async () => {
    const { createTransferQuote } = await import("./transactions/transfer-service");
    const now = new Date("2026-06-12T12:00:00.000Z");
    const providerAt = (publishedAt: string) => ({ id: "test_provider", getRate: vi.fn(async () => ({ fromCurrency: "USD" as const, toCurrency: "EUR" as const, rate: "0.925", effectiveDate: "2026-06-12", publishedAt, provider: "test_provider" })) });
    const before = database.select().from(transferQuotes).all().length;
    await expect(createTransferQuote({ userId: "test-user", senderAccountId: "test-account", recipientAccountNumber: "1000001002", amountMinor: 100, provider: providerAt("2026-06-12T05:59:59.000Z"), now })).rejects.toThrow("current verified exchange rate");
    await expect(createTransferQuote({ userId: "test-user", senderAccountId: "test-account", recipientAccountNumber: "1000001002", amountMinor: 100, provider: providerAt("2026-06-12T12:05:01.000Z"), now })).rejects.toThrow("current verified exchange rate");
    vi.stubEnv("EXCHANGE_RATE_MAX_AGE_SECONDS", "invalid");
    await expect(createTransferQuote({ userId: "test-user", senderAccountId: "test-account", recipientAccountNumber: "1000001002", amountMinor: 100, provider: providerAt(now.toISOString()), now })).rejects.toThrow("current verified exchange rate");
    vi.unstubAllEnvs();
    expect(database.select().from(transferQuotes).all()).toHaveLength(before);
  });

  it("atomically transfers funds and creates both histories, notifications, email records, and audit", async () => {
    const { getTransferReceiptForUser, transferBetweenUsers } = await import("./transactions/transfer-service");
    const quoteId = insertQuote({ id: "quote-success-0001", sourceAmountMinor: 3_500 });
    const idempotencyKey = "transfer-success-0001";
    const authorizationRequestId = authorizeTransaction(quoteId, idempotencyKey);
    const reference = transferBetweenUsers({ userId: "test-user", actorLabel: "test@example.test", quoteId, idempotencyKey, authorizationRequestId });
    expect(database.select().from(accounts).where(eq(accounts.id, "test-account")).get()?.balanceMinor).toBe(16_500);
    expect(database.select().from(accounts).where(eq(accounts.id, "recipient-account")).get()?.balanceMinor).toBe(5_500);
    expect(database.select().from(transactions).where(eq(transactions.reference, `${reference}-D`)).get()).toMatchObject({ amountMinor: -3_500, balanceAfterMinor: 16_500 });
    expect(database.select().from(transactions).where(eq(transactions.reference, `${reference}-C`)).get()).toMatchObject({ amountMinor: 3_500, balanceAfterMinor: 5_500 });
    expect(database.select().from(notifications).where(eq(notifications.eventReference, reference)).all()).toHaveLength(2);
    expect(database.select().from(emailOutbox).all().filter((row) => row.eventReference.startsWith(reference))).toHaveLength(2);
    expect(database.select().from(auditEvents).where(eq(auditEvents.target, reference)).get()?.action).toBe("transfer.complete");
    expect(getTransferReceiptForUser(reference, "test-user")).toMatchObject({ reference, amount: 35, currency: "USD", sourceAmount: 35, recipientAmount: 35, exchangeRate: "1", senderAccountNumber: "1000000001", recipientName: "Recipient User", recipientAccountNumber: "1000001001" });
    expect(getTransferReceiptForUser(reference, "transfer-recipient")).toMatchObject({ reference, recipientAmount: 35 });
    database.update(users).set({ name: "Anonymized recipient" }).where(eq(users.id, "transfer-recipient")).run();
    database.update(accounts).set({ name: "Renamed account" }).where(eq(accounts.id, "recipient-account")).run();
    expect(getTransferReceiptForUser(reference, "test-user")).toMatchObject({ recipientName: "Recipient User", recipientAccountName: "Recipient Account", recipientAccountNumber: "1000001001" });
    database.update(users).set({ name: "Recipient User" }).where(eq(users.id, "transfer-recipient")).run();
    database.update(accounts).set({ name: "Recipient Account" }).where(eq(accounts.id, "recipient-account")).run();
  });

  it("executes a cross-currency quote with exact source and destination ledger amounts", async () => {
    const { transferBetweenUsers } = await import("./transactions/transfer-service");
    const { getUserWorkspace } = await import("./repositories/workspace-repository");
    const quoteId = insertQuote({ id: "quote-cross-0001", recipientAccountId: "recipient-usd", sourceAmountMinor: 3_500, recipientAmountMinor: 3_238, recipientCurrency: "EUR" });
    const idempotencyKey = "transfer-cross-0001";
    const authorizationRequestId = authorizeTransaction(quoteId, idempotencyKey);
    const reference = transferBetweenUsers({ userId: "test-user", actorLabel: "test@example.test", quoteId, idempotencyKey, authorizationRequestId });
    expect(database.select().from(accounts).where(eq(accounts.id, "test-account")).get()?.balanceMinor).toBe(16_500);
    expect(database.select().from(accounts).where(eq(accounts.id, "recipient-usd")).get()?.balanceMinor).toBe(5_238);
    expect(database.select().from(transactions).where(eq(transactions.reference, `${reference}-D`)).get()).toMatchObject({ amountMinor: -3_500, currency: "USD" });
    expect(database.select().from(transactions).where(eq(transactions.reference, `${reference}-C`)).get()).toMatchObject({ amountMinor: 3_238, currency: "EUR" });
    expect(database.select().from(internalTransfers).where(eq(internalTransfers.reference, reference)).get()).toMatchObject({ amountMinor: 3_500, currency: "USD", recipientAmountMinor: 3_238, recipientCurrency: "EUR", exchangeRate: "1" });
    const historyEntry = (await getUserWorkspace("test-user"))?.transactions.find((transaction) => transaction.reference === `${reference}-D`);
    expect(historyEntry?.transferDetails).toMatchObject({ senderName: "Test User", recipientName: "Recipient User", sourceAmount: 35, sourceCurrency: "USD", recipientAmount: 32.38, recipientCurrency: "EUR", exchangeRate: "1" });
    database.update(users).set({ name: "Renamed Test User" }).where(eq(users.id, "test-user")).run();
    const renamedOwnerHistory = (await getUserWorkspace("test-user"))?.transactions.find((transaction) => transaction.reference === `${reference}-D`);
    expect(renamedOwnerHistory?.transferDetails).toMatchObject({ senderName: "Test User", recipientName: "Recipient User" });
    database.update(users).set({ name: "Test User" }).where(eq(users.id, "test-user")).run();
  });

  it("rounds and executes quotes into zero- and three-decimal currencies", async () => {
    const { createTransferQuote, transferBetweenUsers } = await import("./transactions/transfer-service");
    const now = new Date();
    const provider = { id: "test_provider", getRate: vi.fn(async ({ fromCurrency, toCurrency }: import("./exchange-rates/types").ExchangeRateRequest) => ({ fromCurrency, toCurrency, rate: toCurrency === "JPY" ? "149.55" : "0.30725", effectiveDate: now.toISOString().slice(0, 10), publishedAt: now.toISOString(), provider: "test_provider" })) };
    const jpy = await createTransferQuote({ userId: "test-user", senderAccountId: "test-account", recipientAccountNumber: "1000001005", amountMinor: 10_000, provider });
    const kwd = await createTransferQuote({ userId: "test-user", senderAccountId: "test-account", recipientAccountNumber: "1000001006", amountMinor: 5_000, provider });
    expect(jpy.recipientAmount).toBe(14_955);
    expect(kwd.recipientAmount).toBe(15.363);
    authorizeQuote(jpy.id);
    authorizeQuote(kwd.id);
    transferBetweenUsers({ userId: "test-user", actorLabel: "test@example.test", quoteId: jpy.id, idempotencyKey: "transfer-jpy-0001", authorizationRequestId: authorizeTransaction(jpy.id, "transfer-jpy-0001") });
    transferBetweenUsers({ userId: "test-user", actorLabel: "test@example.test", quoteId: kwd.id, idempotencyKey: "transfer-kwd-0001", authorizationRequestId: authorizeTransaction(kwd.id, "transfer-kwd-0001") });
    expect(database.select().from(accounts).where(eq(accounts.id, "recipient-jpy")).get()?.balanceMinor).toBe(14_955);
    expect(database.select().from(accounts).where(eq(accounts.id, "recipient-kwd")).get()?.balanceMinor).toBe(15_363);
  });

  it("rejects expired, wrong-user, and insufficient-balance quotes without consuming them", async () => {
    const { transferBetweenUsers } = await import("./transactions/transfer-service");
    const expired = insertQuote({ id: "quote-expired-0001", sourceAmountMinor: 100, expiresAt: "2020-01-01T00:00:00.000Z" });
    const wrongUser = insertQuote({ id: "quote-owner-0001", sourceAmountMinor: 100 });
    const insufficient = insertQuote({ id: "quote-insufficient-0001", sourceAmountMinor: 20_001 });
    expect(() => transferBetweenUsers({ userId: "test-user", actorLabel: "test@example.test", quoteId: expired, idempotencyKey: "transfer-expired-0001", authorizationRequestId: "missing" })).toThrow("expired");
    expect(() => transferBetweenUsers({ userId: "transfer-other", actorLabel: "other-transfer@example.test", quoteId: wrongUser, idempotencyKey: "transfer-owner-0001", authorizationRequestId: "missing" })).toThrow("invalid");
    expect(() => transferBetweenUsers({ userId: "test-user", actorLabel: "test@example.test", quoteId: insufficient, idempotencyKey: "transfer-insufficient-0001", authorizationRequestId: authorizeTransaction(insufficient, "transfer-insufficient-0001") })).toThrow("Insufficient");
    expect(database.select().from(transferQuotes).where(eq(transferQuotes.id, insufficient)).get()?.consumedAt).toBeNull();
  });

  it("rejects a suspended sender even when the account remains active", async () => {
    const { findTransferRecipient, transferBetweenUsers } = await import("./transactions/transfer-service");
    database.update(users).set({ status: "suspended" }).where(eq(users.id, "test-user")).run();
    try {
      expect(() => findTransferRecipient("test-user", "test-account", "1000001001")).toThrow("sending account is not available");
      const quoteId = insertQuote({ id: "quote-suspended-0001", sourceAmountMinor: 100 });
      expect(() => transferBetweenUsers({ userId: "test-user", actorLabel: "test@example.test", quoteId, idempotencyKey: "transfer-suspended-0001", authorizationRequestId: authorizeTransaction(quoteId, "transfer-suspended-0001") })).toThrow("sending account is not available");
      expect(database.select().from(accounts).where(eq(accounts.id, "test-account")).get()?.balanceMinor).toBe(20_000);
      expect(database.select().from(accounts).where(eq(accounts.id, "recipient-account")).get()?.balanceMinor).toBe(2_000);
    } finally {
      database.update(users).set({ status: "active" }).where(eq(users.id, "test-user")).run();
    }
  });

  it("returns one result for duplicate and concurrent submissions and rejects conflicting key reuse", async () => {
    const { transferBetweenUsers } = await import("./transactions/transfer-service");
    const quoteId = insertQuote({ id: "quote-idempotent-0001", sourceAmountMinor: 500 });
    const input = { userId: "test-user", actorLabel: "test@example.test", quoteId, idempotencyKey: "transfer-idempotent-0001", authorizationRequestId: authorizeTransaction(quoteId, "transfer-idempotent-0001") };
    const [first, second] = await Promise.all([Promise.resolve().then(() => transferBetweenUsers(input)), Promise.resolve().then(() => transferBetweenUsers(input))]);
    expect(second).toBe(first);
    expect(database.select().from(internalTransfers).where(eq(internalTransfers.idempotencyKey, input.idempotencyKey)).all()).toHaveLength(1);
    expect(database.select().from(accounts).where(eq(accounts.id, "test-account")).get()?.balanceMinor).toBe(19_500);
    const conflictingQuote = insertQuote({ id: "quote-idempotent-conflict", sourceAmountMinor: 600 });
    expect(() => transferBetweenUsers({ ...input, quoteId: conflictingQuote })).toThrow("different details");
  });

  it("rejects quote replay with a new idempotency key", async () => {
    const { transferBetweenUsers } = await import("./transactions/transfer-service");
    const quoteId = insertQuote({ id: "quote-replay-0001", sourceAmountMinor: 250 });
    const authorizationRequestId = authorizeTransaction(quoteId, "transfer-replay-0001");
    transferBetweenUsers({ userId: "test-user", actorLabel: "test@example.test", quoteId, idempotencyKey: "transfer-replay-0001", authorizationRequestId });
    expect(() => transferBetweenUsers({ userId: "test-user", actorLabel: "test@example.test", quoteId, idempotencyKey: "transfer-replay-0002", authorizationRequestId })).toThrow("already used");
    expect(database.select().from(accounts).where(eq(accounts.id, "test-account")).get()?.balanceMinor).toBe(19_750);
  });

  it("rolls back all transfer writes when a dependent insert fails", async () => {
    const { transferBetweenUsers } = await import("./transactions/transfer-service");
    sqlite.exec("CREATE TRIGGER fail_transfer_notification BEFORE INSERT ON notifications WHEN NEW.title = 'Transfer completed' BEGIN SELECT RAISE(ABORT, 'forced transfer failure'); END;");
    try {
      const quoteId = insertQuote({ id: "quote-rollback-0001", sourceAmountMinor: 700 });
      expect(() => transferBetweenUsers({ userId: "test-user", actorLabel: "test@example.test", quoteId, idempotencyKey: "transfer-rollback-0001", authorizationRequestId: authorizeTransaction(quoteId, "transfer-rollback-0001") })).toThrow("forced transfer failure");
      expect(database.select().from(accounts).where(eq(accounts.id, "test-account")).get()?.balanceMinor).toBe(20_000);
      expect(database.select().from(accounts).where(eq(accounts.id, "recipient-account")).get()?.balanceMinor).toBe(2_000);
      expect(database.select().from(internalTransfers).where(eq(internalTransfers.idempotencyKey, "transfer-rollback-0001")).get()).toBeUndefined();
      expect(database.select().from(transferQuotes).where(eq(transferQuotes.id, quoteId)).get()?.consumedAt).toBeNull();
    } finally {
      sqlite.exec("DROP TRIGGER fail_transfer_notification;");
    }
  });

  it("shows each transfer entry only in its account owner's history", async () => {
    const { transferBetweenUsers } = await import("./transactions/transfer-service");
    const { getUserWorkspace } = await import("./repositories/workspace-repository");
    const quoteId = insertQuote({ id: "quote-visibility-0001", sourceAmountMinor: 900 });
    const idempotencyKey = "transfer-visibility-0001";
    const reference = transferBetweenUsers({ userId: "test-user", actorLabel: "test@example.test", quoteId, idempotencyKey, authorizationRequestId: authorizeTransaction(quoteId, idempotencyKey) });
    const sender = await getUserWorkspace("test-user");
    const recipient = await getUserWorkspace("transfer-recipient");
    expect(sender?.transactions.some((row) => row.reference === `${reference}-D`)).toBe(true);
    expect(sender?.transactions.some((row) => row.reference === `${reference}-C`)).toBe(false);
    expect(recipient?.transactions.some((row) => row.reference === `${reference}-C`)).toBe(true);
    expect(recipient?.transactions.some((row) => row.reference === `${reference}-D`)).toBe(false);
  });
});

describe("customer-service withdrawal requests", () => {
  beforeAll(() => {
    const now = new Date().toISOString();
    database.insert(users).values({ id: "admin-reviewer", name: "Admin Reviewer", email: "admin@example.test", avatarInitials: "AR", status: "active", locale: "en", adminRole: "administrator", createdAt: now, updatedAt: now }).onConflictDoNothing().run();
  });

  beforeEach(() => {
    database.update(credentials).set({ transactionPinHash: "configured-pin-hash" }).where(eq(credentials.userId, "test-user")).run();
    database.update(accounts).set({ balanceMinor: 20_000, status: "active" }).where(eq(accounts.id, "test-account")).run();
    database.delete(withdrawalRequests).where(eq(withdrawalRequests.userId, "test-user")).run();
  });

  it("requires transaction PIN setup before creating a withdrawal request", async () => {
    const { createWithdrawalRequest } = await import("./withdrawals/withdrawal-service");
    database.update(credentials).set({ transactionPinHash: null }).where(eq(credentials.userId, "test-user")).run();
    expect(() => createWithdrawalRequest({ userId: "test-user", actorLabel: "test@example.test", accountId: "test-account", destinationId: "test-destination", amountMinor: 100, currency: "USD", idempotencyKey: "withdrawal-pin-required-0001" })).toThrow("Set up a transaction PIN in Security before requesting withdrawals.");
  });

  it("creates an owned pending request without changing the balance", async () => {
    const { createWithdrawalRequest, getWithdrawalSupportDetailsForUser } = await import("./withdrawals/withdrawal-service");
    const reference = createWithdrawalRequest({ userId: "test-user", actorLabel: "test@example.test", accountId: "test-account", destinationId: "test-destination", amountMinor: 4_000, currency: "USD", idempotencyKey: "withdrawal-create-0001" });
    expect(database.select().from(withdrawalRequests).where(eq(withdrawalRequests.reference, reference)).get()).toMatchObject({ userId: "test-user", accountId: "test-account", destinationId: "test-destination", destinationBankName: "Test Bank", destinationAccountName: "Test User", destinationAccountNumber: "0123456789", amountMinor: 4_000, status: "pending", authorizationStage: "awaiting_withdrawal_code" });
    expect(database.select().from(accounts).where(eq(accounts.id, "test-account")).get()?.balanceMinor).toBe(20_000);
    expect(database.select().from(notifications).where(eq(notifications.eventReference, `${reference}:authorization_required`)).get()?.title).toBe("Withdrawal authorization required");
    expect(database.select().from(emailOutbox).where(eq(emailOutbox.eventReference, `${reference}:authorization_required`)).get()).toBeTruthy();
    expect(database.select().from(auditEvents).where(eq(auditEvents.target, reference)).get()?.action).toBe("withdrawal_request.create");
    expect(getWithdrawalSupportDetailsForUser(reference, "test-user")).toEqual({ reference, amountMinor: 4_000, currency: "USD", bankName: "Test Bank", accountName: "Test User", maskedAccountNumber: "****6789" });
    expect(() => getWithdrawalSupportDetailsForUser(reference, "transfer-other")).toThrow("unavailable");
    expect(createWithdrawalRequest({ userId: "test-user", actorLabel: "test@example.test", accountId: "test-account", destinationId: "test-destination", amountMinor: 4_000, currency: "USD", idempotencyKey: "withdrawal-create-0001" })).toBe(reference);
  });

  it("uses the official support contacts and preserves only valid configuration", async () => {
    vi.stubEnv("CUSTOMER_SERVICE_EMAIL", "support@citizavrexo.com");
    const { getCustomerServiceContact } = await import("./customer-service");
    expect(getCustomerServiceContact()).toEqual({ whatsappNumber: "+44 7392 968025", whatsappUrl: "https://wa.me/447392968025", lineUrl: "https://line.me/ti/p/RDf5RXaT2G", email: "support@citizavrexo.com" });
    vi.stubEnv("CUSTOMER_SERVICE_WHATSAPP_URL", "https://example.com/not-whatsapp");
    vi.stubEnv("CUSTOMER_SERVICE_LINE_URL", "http://line.me/insecure");
    vi.stubEnv("CUSTOMER_SERVICE_EMAIL", "invalid-email");
    expect(getCustomerServiceContact()).toEqual({ whatsappNumber: "+44 7392 968025", whatsappUrl: "https://wa.me/447392968025", lineUrl: "https://line.me/ti/p/RDf5RXaT2G", email: undefined });
  });

  it("requires successful two-stage authorization before administrative completion", async () => {
    const {
      createWithdrawalRequest,
      issueWithdrawalAuthorizationCode,
      reviewWithdrawalRequest,
      verifyWithdrawalAuthorizationCode,
    } = await import("./withdrawals/withdrawal-service");

    const reference = createWithdrawalRequest({
      userId: "test-user",
      actorLabel: "test@example.test",
      accountId: "test-account",
      destinationId: "test-destination",
      amountMinor: 1000,
      currency: "USD",
      idempotencyKey: "withdrawal-two-stage-0001",
    });
    const request = database.select().from(withdrawalRequests).where(eq(withdrawalRequests.reference, reference)).get();
    expect(request).toBeTruthy();

    expect(() => reviewWithdrawalRequest({
      actorId: "admin-reviewer",
      actorLabel: "admin@example.test",
      actorRole: "administrator",
      requestId: request!.id,
      decision: "completed",
    })).toThrow("authorization is not complete");

    await expect(issueWithdrawalAuthorizationCode({
      actorId: "admin-reviewer",
      actorLabel: "admin@example.test",
      actorRole: "administrator",
      requestId: request!.id,
      stage: "swift_code",
      mode: "issue",
    })).rejects.toThrow("not currently available");

    const withdrawalCode = await issueWithdrawalAuthorizationCode({
      actorId: "admin-reviewer",
      actorLabel: "admin@example.test",
      actorRole: "administrator",
      requestId: request!.id,
      stage: "withdrawal_code",
      mode: "issue",
    });

    const firstStep = await verifyWithdrawalAuthorizationCode({
      userId: "test-user",
      actorLabel: "test@example.test",
      requestId: request!.id,
      stage: "withdrawal_code",
      code: withdrawalCode.code,
    });
    expect(firstStep).toMatchObject({ nextStage: "awaiting_swift_code", authorizationCompleted: false });

    const swiftCode = await issueWithdrawalAuthorizationCode({
      actorId: "admin-reviewer",
      actorLabel: "admin@example.test",
      actorRole: "administrator",
      requestId: request!.id,
      stage: "swift_code",
      mode: "issue",
    });

    const finalStep = await verifyWithdrawalAuthorizationCode({
      userId: "test-user",
      actorLabel: "test@example.test",
      requestId: request!.id,
      stage: "swift_code",
      code: swiftCode.code,
    });
    expect(finalStep).toMatchObject({ nextStage: "authorized", authorizationCompleted: true });

    reviewWithdrawalRequest({
      actorId: "admin-reviewer",
      actorLabel: "admin@example.test",
      actorRole: "administrator",
      requestId: request!.id,
      decision: "completed",
    });
    expect(database.select().from(withdrawalRequests).where(eq(withdrawalRequests.id, request!.id)).get()?.status).toBe("completed");
  });

  it("rejects expired authorization codes and records expiry without exposing plaintext codes", async () => {
    const {
      createWithdrawalRequest,
      issueWithdrawalAuthorizationCode,
      verifyWithdrawalAuthorizationCode,
    } = await import("./withdrawals/withdrawal-service");

    const reference = createWithdrawalRequest({ userId: "test-user", actorLabel: "test@example.test", accountId: "test-account", destinationId: "test-destination", amountMinor: 901, currency: "USD", idempotencyKey: "withdrawal-expired-code-0001" });
    const request = database.select().from(withdrawalRequests).where(eq(withdrawalRequests.reference, reference)).get()!;
    const issued = await issueWithdrawalAuthorizationCode({ actorId: "admin-reviewer", actorLabel: "admin@example.test", actorRole: "administrator", requestId: request.id, stage: "withdrawal_code", mode: "issue" });

    database.update(withdrawalAuthorizationCodes).set({ expiresAt: "2020-01-01T00:00:00.000Z" }).where(eq(withdrawalAuthorizationCodes.withdrawalRequestId, request.id)).run();

    await expect(verifyWithdrawalAuthorizationCode({ userId: "test-user", actorLabel: "test@example.test", requestId: request.id, stage: "withdrawal_code", code: issued.code, now: new Date("2026-01-01T00:00:00.000Z") })).rejects.toThrow("expired");

    const codeRow = database.select().from(withdrawalAuthorizationCodes).where(eq(withdrawalAuthorizationCodes.withdrawalRequestId, request.id)).get();
    expect(codeRow?.status).toBe("expired");
    const attempt = database.select().from(withdrawalAuthorizationAttempts).where(eq(withdrawalAuthorizationAttempts.withdrawalRequestId, request.id)).get();
    expect(attempt?.outcome).toBe("expired");
    const audit = database.select().from(auditEvents).where(and(eq(auditEvents.target, reference), eq(auditEvents.action, "withdrawal_authorization.code_expired"))).get();
    expect(audit).toBeTruthy();
    expect(audit?.metadataJson).not.toContain(issued.code);
  });

  it("enforces single-use by rejecting reused authorization codes", async () => {
    const {
      createWithdrawalRequest,
      issueWithdrawalAuthorizationCode,
      verifyWithdrawalAuthorizationCode,
    } = await import("./withdrawals/withdrawal-service");

    const reference = createWithdrawalRequest({ userId: "test-user", actorLabel: "test@example.test", accountId: "test-account", destinationId: "test-destination", amountMinor: 902, currency: "USD", idempotencyKey: "withdrawal-reused-code-0001" });
    const request = database.select().from(withdrawalRequests).where(eq(withdrawalRequests.reference, reference)).get()!;
    const issued = await issueWithdrawalAuthorizationCode({ actorId: "admin-reviewer", actorLabel: "admin@example.test", actorRole: "administrator", requestId: request.id, stage: "withdrawal_code", mode: "issue" });

    await expect(verifyWithdrawalAuthorizationCode({ userId: "test-user", actorLabel: "test@example.test", requestId: request.id, stage: "withdrawal_code", code: issued.code })).resolves.toMatchObject({ nextStage: "awaiting_swift_code" });
    await expect(verifyWithdrawalAuthorizationCode({ userId: "test-user", actorLabel: "test@example.test", requestId: request.id, stage: "withdrawal_code", code: issued.code })).rejects.toThrow("not currently available");
  });

  it("rejects verification of revoked codes and accepts the reissued replacement", async () => {
    const {
      createWithdrawalRequest,
      issueWithdrawalAuthorizationCode,
      revokeWithdrawalAuthorizationCode,
      verifyWithdrawalAuthorizationCode,
    } = await import("./withdrawals/withdrawal-service");

    const reference = createWithdrawalRequest({ userId: "test-user", actorLabel: "test@example.test", accountId: "test-account", destinationId: "test-destination", amountMinor: 903, currency: "USD", idempotencyKey: "withdrawal-revoked-reissued-0001" });
    const request = database.select().from(withdrawalRequests).where(eq(withdrawalRequests.reference, reference)).get()!;

    const first = await issueWithdrawalAuthorizationCode({ actorId: "admin-reviewer", actorLabel: "admin@example.test", actorRole: "administrator", requestId: request.id, stage: "withdrawal_code", mode: "issue" });
    revokeWithdrawalAuthorizationCode({ actorId: "admin-reviewer", actorLabel: "admin@example.test", actorRole: "administrator", requestId: request.id, stage: "withdrawal_code", reason: "manual" });
    await expect(verifyWithdrawalAuthorizationCode({ userId: "test-user", actorLabel: "test@example.test", requestId: request.id, stage: "withdrawal_code", code: first.code })).rejects.toThrow("not available");

    const replacement = await issueWithdrawalAuthorizationCode({ actorId: "admin-reviewer", actorLabel: "admin@example.test", actorRole: "administrator", requestId: request.id, stage: "withdrawal_code", mode: "issue" });
    await expect(verifyWithdrawalAuthorizationCode({ userId: "test-user", actorLabel: "test@example.test", requestId: request.id, stage: "withdrawal_code", code: replacement.code })).resolves.toMatchObject({ nextStage: "awaiting_swift_code" });
    expect(replacement.code).not.toBe(first.code);
  });

  it("revokes active code on reissue and denies the old code", async () => {
    const {
      createWithdrawalRequest,
      issueWithdrawalAuthorizationCode,
      verifyWithdrawalAuthorizationCode,
    } = await import("./withdrawals/withdrawal-service");

    const reference = createWithdrawalRequest({ userId: "test-user", actorLabel: "test@example.test", accountId: "test-account", destinationId: "test-destination", amountMinor: 904, currency: "USD", idempotencyKey: "withdrawal-reissue-0001" });
    const request = database.select().from(withdrawalRequests).where(eq(withdrawalRequests.reference, reference)).get()!;

    const original = await issueWithdrawalAuthorizationCode({ actorId: "admin-reviewer", actorLabel: "admin@example.test", actorRole: "administrator", requestId: request.id, stage: "withdrawal_code", mode: "issue" });
    const reissued = await issueWithdrawalAuthorizationCode({ actorId: "admin-reviewer", actorLabel: "admin@example.test", actorRole: "administrator", requestId: request.id, stage: "withdrawal_code", mode: "reissue" });

    const codes = database.select().from(withdrawalAuthorizationCodes).where(eq(withdrawalAuthorizationCodes.withdrawalRequestId, request.id)).all();
    expect(codes.some((row) => row.status === "revoked")).toBe(true);
    expect(codes.some((row) => row.status === "issued")).toBe(true);
    await expect(verifyWithdrawalAuthorizationCode({ userId: "test-user", actorLabel: "test@example.test", requestId: request.id, stage: "withdrawal_code", code: original.code })).rejects.toThrow("invalid or expired");
    await expect(verifyWithdrawalAuthorizationCode({ userId: "test-user", actorLabel: "test@example.test", requestId: request.id, stage: "withdrawal_code", code: reissued.code })).resolves.toMatchObject({ nextStage: "awaiting_swift_code" });
  });

  it("allows exactly one successful concurrent verification for the same code", async () => {
    const {
      createWithdrawalRequest,
      issueWithdrawalAuthorizationCode,
      verifyWithdrawalAuthorizationCode,
    } = await import("./withdrawals/withdrawal-service");

    const reference = createWithdrawalRequest({ userId: "test-user", actorLabel: "test@example.test", accountId: "test-account", destinationId: "test-destination", amountMinor: 905, currency: "USD", idempotencyKey: "withdrawal-concurrent-0001" });
    const request = database.select().from(withdrawalRequests).where(eq(withdrawalRequests.reference, reference)).get()!;
    const issued = await issueWithdrawalAuthorizationCode({ actorId: "admin-reviewer", actorLabel: "admin@example.test", actorRole: "administrator", requestId: request.id, stage: "withdrawal_code", mode: "issue" });

    const [a, b] = await Promise.allSettled([
      verifyWithdrawalAuthorizationCode({ userId: "test-user", actorLabel: "test@example.test", requestId: request.id, stage: "withdrawal_code", code: issued.code }),
      verifyWithdrawalAuthorizationCode({ userId: "test-user", actorLabel: "test@example.test", requestId: request.id, stage: "withdrawal_code", code: issued.code }),
    ]);

    const fulfilled = [a, b].filter((item): item is PromiseFulfilledResult<Awaited<ReturnType<typeof verifyWithdrawalAuthorizationCode>>> => item.status === "fulfilled");
    const rejected = [a, b].filter((item): item is PromiseRejectedResult => item.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(String(rejected[0].reason)).toContain("not currently available");
  });

  it("locks authorization code verification after repeated failures, then allows retry after lockout", async () => {
    const {
      createWithdrawalRequest,
      issueWithdrawalAuthorizationCode,
      verifyWithdrawalAuthorizationCode,
    } = await import("./withdrawals/withdrawal-service");

    const started = new Date("2026-10-10T10:00:00.000Z");
    const reference = createWithdrawalRequest({ userId: "test-user", actorLabel: "test@example.test", accountId: "test-account", destinationId: "test-destination", amountMinor: 907, currency: "USD", idempotencyKey: "withdrawal-lockout-0001" });
    const request = database.select().from(withdrawalRequests).where(eq(withdrawalRequests.reference, reference)).get()!;
    const issued = await issueWithdrawalAuthorizationCode({ actorId: "admin-reviewer", actorLabel: "admin@example.test", actorRole: "administrator", requestId: request.id, stage: "withdrawal_code", mode: "issue" });

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(verifyWithdrawalAuthorizationCode({ userId: "test-user", actorLabel: `session-a-${attempt}`, requestId: request.id, stage: "withdrawal_code", code: "WDR-XXXXX-XXXXX", now: started })).rejects.toThrow("invalid or expired");
    }
    await expect(verifyWithdrawalAuthorizationCode({ userId: "test-user", actorLabel: "session-b", requestId: request.id, stage: "withdrawal_code", code: "WDR-XXXXX-XXXXX", now: started })).rejects.toThrow("Too many incorrect code attempts");
    await expect(verifyWithdrawalAuthorizationCode({ userId: "test-user", actorLabel: "session-c", requestId: request.id, stage: "withdrawal_code", code: issued.code, now: started })).rejects.toThrow("Too many incorrect code attempts");

    const afterLockout = new Date(started.getTime() + 10 * 60 * 1000 + 1000);
    await expect(verifyWithdrawalAuthorizationCode({ userId: "test-user", actorLabel: "session-d", requestId: request.id, stage: "withdrawal_code", code: issued.code, now: afterLockout })).resolves.toMatchObject({ nextStage: "awaiting_swift_code" });
  });

  it("does not store plaintext authorization codes in audit records or notifications", async () => {
    const {
      createWithdrawalRequest,
      issueWithdrawalAuthorizationCode,
    } = await import("./withdrawals/withdrawal-service");

    const reference = createWithdrawalRequest({ userId: "test-user", actorLabel: "test@example.test", accountId: "test-account", destinationId: "test-destination", amountMinor: 906, currency: "USD", idempotencyKey: "withdrawal-no-plaintext-0001" });
    const request = database.select().from(withdrawalRequests).where(eq(withdrawalRequests.reference, reference)).get()!;
    const issued = await issueWithdrawalAuthorizationCode({ actorId: "admin-reviewer", actorLabel: "admin@example.test", actorRole: "administrator", requestId: request.id, stage: "withdrawal_code", mode: "issue" });

    const auditRows = database.select().from(auditEvents).where(eq(auditEvents.target, reference)).all();
    const notificationRows = database.select().from(notifications).where(eq(notifications.userId, "test-user")).all();
    expect(auditRows.some((row) => row.metadataJson.includes(issued.code))).toBe(false);
    expect(notificationRows.some((row) => row.message.includes(issued.code) || row.title.includes(issued.code))).toBe(false);
    expect(database.select().from(withdrawalAuthorizationCodes).where(eq(withdrawalAuthorizationCodes.withdrawalRequestId, request.id)).get()?.codeHash).not.toBe(issued.code);
  });

  it("rejects invalid, excessive, unauthorized, inactive, conflicting, and duplicate pending requests", async () => {
    const { createWithdrawalRequest } = await import("./withdrawals/withdrawal-service");
    expect(() => createWithdrawalRequest({ userId: "test-user", actorLabel: "test@example.test", accountId: "test-account", destinationId: "test-destination", amountMinor: 0, currency: "USD", idempotencyKey: "withdrawal-zero-0001" })).toThrow("greater than zero");
    expect(() => createWithdrawalRequest({ userId: "test-user", actorLabel: "test@example.test", accountId: "test-account", destinationId: "test-destination", amountMinor: -1, currency: "USD", idempotencyKey: "withdrawal-negative-0001" })).toThrow("greater than zero");
    expect(() => createWithdrawalRequest({ userId: "test-user", actorLabel: "test@example.test", accountId: "test-account", destinationId: "test-destination", amountMinor: 20_001, currency: "USD", idempotencyKey: "withdrawal-balance-0001" })).toThrow("available balance");
    expect(() => createWithdrawalRequest({ userId: "test-user", actorLabel: "test@example.test", accountId: "other-sender", destinationId: "test-destination", amountMinor: 100, currency: "USD", idempotencyKey: "withdrawal-owner-0001" })).toThrow("not available");
    database.update(accounts).set({ status: "suspended" }).where(eq(accounts.id, "test-account")).run();
    expect(() => createWithdrawalRequest({ userId: "test-user", actorLabel: "test@example.test", accountId: "test-account", destinationId: "test-destination", amountMinor: 100, currency: "USD", idempotencyKey: "withdrawal-inactive-0001" })).toThrow("must be active");
    database.update(accounts).set({ status: "active" }).where(eq(accounts.id, "test-account")).run();
    expect(() => createWithdrawalRequest({ userId: "test-user", actorLabel: "test@example.test", accountId: "test-account", destinationId: "test-destination", amountMinor: 100, currency: unsupportedCurrency, idempotencyKey: "withdrawal-currency-0001" })).toThrow("currency changed");
    createWithdrawalRequest({ userId: "test-user", actorLabel: "test@example.test", accountId: "test-account", destinationId: "test-destination", amountMinor: 700, currency: "USD", idempotencyKey: "withdrawal-conflict-0001" });
    expect(() => createWithdrawalRequest({ userId: "test-user", actorLabel: "test@example.test", accountId: "test-account", destinationId: "test-destination", amountMinor: 100, currency: "USD", idempotencyKey: "withdrawal-conflict-0001" })).toThrow("different details");
    expect(() => createWithdrawalRequest({ userId: "test-user", actorLabel: "test@example.test", accountId: "test-account", destinationId: "test-destination", amountMinor: 100, currency: "USD", idempotencyKey: "withdrawal-second-0001" })).toThrow("already pending");
  });

  it("allows an authorized admin to complete once without debiting the account", async () => {
    const { createWithdrawalRequest, reviewWithdrawalRequest } = await import("./withdrawals/withdrawal-service");
    const reference = createWithdrawalRequest({ userId: "test-user", actorLabel: "test@example.test", accountId: "test-account", destinationId: "test-destination", amountMinor: 800, currency: "USD", idempotencyKey: "withdrawal-review-0001" });
    const request = database.select().from(withdrawalRequests).where(eq(withdrawalRequests.reference, reference)).get();
    expect(request).toBeTruthy();
    expect(() => reviewWithdrawalRequest({ actorId: "support", actorLabel: "support@example.test", actorRole: "support_agent", requestId: request!.id, decision: "completed" })).toThrow("not permitted");
    expect(() => reviewWithdrawalRequest({ actorId: "test-user", actorLabel: "test@example.test", actorRole: "administrator", requestId: request!.id, decision: "completed" })).toThrow("own withdrawal");
    expect(() => reviewWithdrawalRequest({ actorId: "admin-reviewer", actorLabel: "admin@example.test", actorRole: "administrator", requestId: request!.id, decision: "completed" })).toThrow("authorization is not complete");
    database.update(withdrawalRequests).set({ authorizationStage: "authorized", authorizationCompletedAt: new Date().toISOString() }).where(eq(withdrawalRequests.id, request!.id)).run();
    reviewWithdrawalRequest({ actorId: "admin-reviewer", actorLabel: "admin@example.test", actorRole: "administrator", requestId: request!.id, decision: "completed" });
    expect(database.select().from(withdrawalRequests).where(eq(withdrawalRequests.id, request!.id)).get()).toMatchObject({ status: "completed", reviewedBy: "admin-reviewer" });
    expect(database.select().from(accounts).where(eq(accounts.id, "test-account")).get()?.balanceMinor).toBe(20_000);
    expect(database.select().from(auditEvents).where(and(eq(auditEvents.target, request!.reference), eq(auditEvents.action, "withdrawal_request.completed"))).get()).toBeTruthy();
    expect(() => reviewWithdrawalRequest({ actorId: "admin-reviewer", actorLabel: "admin@example.test", actorRole: "administrator", requestId: request!.id, decision: "completed" })).toThrow("no longer available");
  });

  it("supports atomic rejection and owner-only cancellation", async () => {
    const { cancelOwnedWithdrawalRequest, createWithdrawalRequest, reviewWithdrawalRequest } = await import("./withdrawals/withdrawal-service");
    const rejectedReference = createWithdrawalRequest({ userId: "test-user", actorLabel: "test@example.test", accountId: "test-account", destinationId: "test-destination", amountMinor: 500, currency: "USD", idempotencyKey: "withdrawal-reject-0001" });
    const rejected = database.select().from(withdrawalRequests).where(eq(withdrawalRequests.reference, rejectedReference)).get()!;
    database.update(withdrawalRequests).set({ authorizationStage: "authorized", authorizationCompletedAt: new Date().toISOString() }).where(eq(withdrawalRequests.id, rejected.id)).run();
    expect(() => reviewWithdrawalRequest({ actorId: "admin-reviewer", actorLabel: "admin@example.test", actorRole: "administrator", requestId: rejected.id, decision: "rejected" })).toThrow("rejection reason");
    reviewWithdrawalRequest({ actorId: "admin-reviewer", actorLabel: "admin@example.test", actorRole: "administrator", requestId: rejected.id, decision: "rejected", rejectionReason: "Customer Service could not complete the request." });
    expect(database.select().from(withdrawalRequests).where(eq(withdrawalRequests.id, rejected.id)).get()?.status).toBe("rejected");
    const cancelledReference = createWithdrawalRequest({ userId: "test-user", actorLabel: "test@example.test", accountId: "test-account", destinationId: "test-destination", amountMinor: 600, currency: "USD", idempotencyKey: "withdrawal-cancel-0001" });
    const cancelled = database.select().from(withdrawalRequests).where(eq(withdrawalRequests.reference, cancelledReference)).get()!;
    expect(() => cancelOwnedWithdrawalRequest({ userId: "transfer-other", actorLabel: "other@example.test", requestId: cancelled.id })).toThrow("cannot be cancelled");
    cancelOwnedWithdrawalRequest({ userId: "test-user", actorLabel: "test@example.test", requestId: cancelled.id });
    expect(database.select().from(withdrawalRequests).where(eq(withdrawalRequests.id, cancelled.id)).get()?.status).toBe("cancelled");
    expect(database.select().from(accounts).where(eq(accounts.id, "test-account")).get()?.balanceMinor).toBe(20_000);
  });

  it("rolls back a withdrawal request when a dependent insert fails", async () => {
    const { createWithdrawalRequest } = await import("./withdrawals/withdrawal-service");
    sqlite.exec("CREATE TRIGGER fail_withdrawal_notification BEFORE INSERT ON notifications WHEN NEW.title = 'Withdrawal authorization required' BEGIN SELECT RAISE(ABORT, 'forced withdrawal failure'); END;");
    try {
      expect(() => createWithdrawalRequest({ userId: "test-user", actorLabel: "test@example.test", accountId: "test-account", destinationId: "test-destination", amountMinor: 700, currency: "USD", idempotencyKey: "withdrawal-rollback-0001" })).toThrow("forced withdrawal failure");
      expect(database.select().from(withdrawalRequests).where(eq(withdrawalRequests.idempotencyKey, "withdrawal-rollback-0001")).get()).toBeUndefined();
      expect(database.select().from(accounts).where(eq(accounts.id, "test-account")).get()?.balanceMinor).toBe(20_000);
    } finally {
      sqlite.exec("DROP TRIGGER fail_withdrawal_notification;");
    }
  });

  it("manages saved destinations with strict owner scope", async () => {
    const { createBankDestination, deleteOwnedBankDestination } = await import("./withdrawals/bank-destination-service");
    const { getUserWorkspace } = await import("./repositories/workspace-repository");
    const destination = createBankDestination({ userId: "test-user", actorLabel: "test@example.test", label: "Savings bank", bankName: "Second Bank", accountName: "Test User", accountNumber: "5555555555", country: "NG", destinationType: "bank_account", currency: "USD" });
    expect(destination).toMatchObject({ bankName: "Second Bank", accountNumber: "5555555555", currency: "USD" });
    expect(database.select().from(bankDestinations).where(eq(bankDestinations.id, destination.id)).get()).toMatchObject({ userId: "test-user", bankName: "Second Bank" });
    expect((await getUserWorkspace("test-user"))?.bankDestinations).toContainEqual(destination);
    expect((await getUserWorkspace("transfer-other"))?.bankDestinations).not.toContainEqual(expect.objectContaining({ id: destination.id }));
    expect(() => createBankDestination({ userId: "test-user", actorLabel: "test@example.test", label: "Duplicate", bankName: "Second Bank", accountName: "Test User", accountNumber: "5555555555", country: "NG", destinationType: "bank_account", currency: "USD" })).toThrow("already saved");
    expect(() => deleteOwnedBankDestination({ userId: "transfer-other", actorLabel: "other@example.test", destinationId: destination.id })).toThrow("not available");
    deleteOwnedBankDestination({ userId: "test-user", actorLabel: "test@example.test", destinationId: destination.id });
    expect(database.select().from(bankDestinations).where(eq(bankDestinations.id, destination.id)).get()).toBeUndefined();
  });
});

describe("profile images", () => {
  it("accepts validated image bytes, replaces the old file, and rejects disguised content", async () => {
    const { saveProfileImage } = await import("./users/profile-image-service");
    const png = new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])], "profile.png", { type: "image/png" });
    await saveProfileImage({ userId: "test-user", actorLabel: "test@example.test", file: png });
    const firstKey = database.select({ key: users.profileImageKey }).from(users).where(eq(users.id, "test-user")).get()?.key;
    expect(firstKey).toMatch(/\.png$/);
    expect(existsSync(join(directory, "profile-images", firstKey!))).toBe(true);
    const webp = new File([Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])], "profile.webp", { type: "image/webp" });
    await saveProfileImage({ userId: "test-user", actorLabel: "test@example.test", file: webp });
    expect(existsSync(join(directory, "profile-images", firstKey!))).toBe(false);
    await expect(saveProfileImage({ userId: "test-user", actorLabel: "test@example.test", file: new File(["not an image"], "fake.png", { type: "image/png" }) })).rejects.toThrow("JPEG, PNG, or WebP");
  });
});

describe("currency-change requests", () => {
  const createAccount = (suffix: string, balanceMinor = 0) => {
    const now = new Date().toISOString();
    const userId = `currency-user-${suffix}`;
    const accountId = `currency-account-${suffix}`;
    database.insert(users).values({ id: userId, name: `Currency User ${suffix}`, email: `currency-${suffix}@example.test`, avatarInitials: "CU", status: "active", locale: "en", createdAt: now, updatedAt: now }).run();
    database.insert(accounts).values({ id: accountId, userId, name: "Personal Account", number: `8${suffix.padStart(9, "0").slice(-9)}`, type: "personal", currency: "USD", balanceMinor, status: "active", createdAt: now, updatedAt: now }).run();
    return { now, userId, accountId };
  };

  beforeAll(() => {
    const now = new Date().toISOString();
    database.insert(users).values({ id: "currency-admin", name: "Currency Admin", email: "currency-admin@example.test", avatarInitials: "CA", status: "active", locale: "en", adminRole: "administrator", createdAt: now, updatedAt: now }).onConflictDoNothing().run();
  });

  it("approves only a zero-balance clean account without rewriting historical money", async () => {
    const { accountId, userId, now } = createAccount("101");
    database.insert(transactions).values({ id: "currency-history-101", reference: "CURRENCY-HISTORY-101", accountId, type: "credit", description: "Historical credit", amountMinor: 500, currency: "USD", occurredAt: now, status: "completed", balanceBeforeMinor: 0, balanceAfterMinor: 500, createdBy: userId, createdAt: now }).run();
    const { requestCurrencyChange, reviewCurrencyChange } = await import("./accounts/currency-change-service");
    const requestId = requestCurrencyChange({ userId, actorLabel: `currency-101@example.test`, accountId, requestedCurrency: "JPY" });
    reviewCurrencyChange({ actorId: "currency-admin", actorLabel: "currency-admin@example.test", actorRole: "administrator", requestId, decision: "approved" });
    expect(database.select().from(accounts).where(eq(accounts.id, accountId)).get()).toMatchObject({ currency: "JPY", balanceMinor: 0 });
    expect(database.select().from(transactions).where(eq(transactions.id, "currency-history-101")).get()).toMatchObject({ currency: "USD", amountMinor: 500 });
    expect(database.select().from(currencyChangeRequests).where(eq(currencyChangeRequests.id, requestId)).get()).toMatchObject({ status: "approved", currentCurrency: "USD", requestedCurrency: "JPY" });
  });

  it("rejects non-zero balances, pending withdrawals, active cards, and pending card requests", async () => {
    const { requestCurrencyChange } = await import("./accounts/currency-change-service");
    const nonzero = createAccount("102", 1);
    expect(() => requestCurrencyChange({ userId: nonzero.userId, actorLabel: nonzero.userId, accountId: nonzero.accountId, requestedCurrency: "EUR" })).toThrow("balance must be zero");
    const withdrawal = createAccount("103");
    database.insert(withdrawalRequests).values({ id: "currency-withdrawal-103", reference: "NCW-CURRENCY-103", idempotencyKey: "currency-withdrawal-key-103", userId: withdrawal.userId, accountId: withdrawal.accountId, amountMinor: 100, currency: "USD", status: "pending", submittedAt: withdrawal.now, updatedAt: withdrawal.now }).run();
    expect(() => requestCurrencyChange({ userId: withdrawal.userId, actorLabel: withdrawal.userId, accountId: withdrawal.accountId, requestedCurrency: "EUR" })).toThrow("pending withdrawal");
    const card = createAccount("104");
    database.insert(cards).values({ id: "currency-card-104", accountId: card.accountId, label: "Active card", lastFour: "0104", expires: "12/30", status: "active", monthlyLimitMinor: 0, monthlySpentMinor: 0, onlinePayments: true, contactlessPayments: true, createdAt: card.now, updatedAt: card.now }).run();
    expect(() => requestCurrencyChange({ userId: card.userId, actorLabel: card.userId, accountId: card.accountId, requestedCurrency: "EUR" })).toThrow("active or frozen card");
    database.update(cards).set({ status: "frozen" }).where(eq(cards.id, "currency-card-104")).run();
    expect(() => requestCurrencyChange({ userId: card.userId, actorLabel: card.userId, accountId: card.accountId, requestedCurrency: "EUR" })).toThrow("active or frozen card");
    const cardRequest = createAccount("105");
    database.insert(cardRequests).values({ id: "currency-card-request-105", userId: cardRequest.userId, accountId: cardRequest.accountId, label: "Pending card", monthlyLimitMinor: 0, status: "pending", submittedAt: cardRequest.now, updatedAt: cardRequest.now }).run();
    expect(() => requestCurrencyChange({ userId: cardRequest.userId, actorLabel: cardRequest.userId, accountId: cardRequest.accountId, requestedCurrency: "EUR" })).toThrow("pending card request");
  });

  it("rechecks financial cleanliness at approval and supports a reasoned rejection", async () => {
    const { requestCurrencyChange, reviewCurrencyChange } = await import("./accounts/currency-change-service");
    const changed = createAccount("106");
    const changedRequest = requestCurrencyChange({ userId: changed.userId, actorLabel: changed.userId, accountId: changed.accountId, requestedCurrency: "GBP" });
    database.update(accounts).set({ balanceMinor: 1 }).where(eq(accounts.id, changed.accountId)).run();
    expect(() => reviewCurrencyChange({ actorId: "currency-admin", actorLabel: "currency-admin@example.test", actorRole: "administrator", requestId: changedRequest, decision: "approved" })).toThrow("balance must be zero");
    expect(database.select().from(currencyChangeRequests).where(eq(currencyChangeRequests.id, changedRequest)).get()?.status).toBe("pending");
    const rejected = createAccount("107");
    const rejectedRequest = requestCurrencyChange({ userId: rejected.userId, actorLabel: rejected.userId, accountId: rejected.accountId, requestedCurrency: "EUR" });
    reviewCurrencyChange({ actorId: "currency-admin", actorLabel: "currency-admin@example.test", actorRole: "administrator", requestId: rejectedRequest, decision: "rejected", rejectionReason: "Account configuration is incomplete." });
    expect(database.select().from(currencyChangeRequests).where(eq(currencyChangeRequests.id, rejectedRequest)).get()).toMatchObject({ status: "rejected", rejectionReason: "Account configuration is incomplete." });
    expect(database.select().from(emailOutbox).where(eq(emailOutbox.eventReference, `CURRENCY-${rejectedRequest}:rejected`)).get()).toBeTruthy();
  });
});

describe("secure user deletion", () => {
  it("rejects unauthorized, self, administrator, and last-super-admin deletion", async () => {
    const now = new Date().toISOString();
    database.insert(users).values({ id: "last-super", name: "Last Super", email: "last-super@example.test", avatarInitials: "LS", status: "active", locale: "en", adminRole: "super_admin", createdAt: now, updatedAt: now }).run();
    const { deleteUser } = await import("./users/user-deletion-service");
    expect(() => deleteUser({ actorId: "ordinary", actorLabel: "ordinary@example.test", actorRole: null, targetUserId: "test-user", confirmation: "DELETE USER" })).toThrow("not permitted");
    expect(() => deleteUser({ actorId: "support", actorLabel: "support@example.test", actorRole: "support_agent", targetUserId: "test-user", confirmation: "DELETE USER" })).toThrow("not permitted");
    expect(() => deleteUser({ actorId: "test-user", actorLabel: "test@example.test", actorRole: "super_admin", targetUserId: "test-user", confirmation: "DELETE USER" })).toThrow("own account");
    expect(() => deleteUser({ actorId: "another-super", actorLabel: "admin@example.test", actorRole: "super_admin", targetUserId: "last-super", confirmation: "DELETE USER" })).toThrow("last super administrator");
    database.insert(users).values({ id: "second-admin", name: "Second Admin", email: "second-admin@example.test", avatarInitials: "SA", status: "active", locale: "en", adminRole: "administrator", createdAt: now, updatedAt: now }).run();
    expect(() => deleteUser({ actorId: "last-super", actorLabel: "last-super@example.test", actorRole: "super_admin", targetUserId: "second-admin", confirmation: "DELETE USER" })).toThrow("existing administrator policy");
    expect(database.select().from(users).where(eq(users.id, "second-admin")).get()?.status).toBe("active");
  });

  it("atomically anonymizes a user, revokes access, and preserves financial and audit history", async () => {
    const now = new Date().toISOString();
    database.insert(credentials).values({ userId: "rejected-user", passwordHash: "removed-hash", passwordChangedAt: now }).run();
    database.insert(sessions).values({ id: "delete-session", userId: "rejected-user", tokenHash: "delete-token", expiresAt: "2099-01-01T00:00:00.000Z", lastActiveAt: now, createdAt: now }).run();
    database.insert(devices).values({ id: "delete-device", userId: "rejected-user", sessionId: "delete-session", name: "Desktop device", browser: "Browser", location: "Location", lastActiveAt: now, loginAt: now, trusted: true }).run();
    database.insert(authenticationTokens).values({ id: "11111111-1111-4111-8111-111111111111", userId: "rejected-user", purpose: "password_reset", tokenHash: "delete-auth-token", expiresAt: "2099-01-01T00:00:00.000Z", createdAt: now }).run();
    database.insert(recoveryCodes).values({ id: "delete-code", userId: "rejected-user", codeHash: "delete-code-hash", createdAt: now }).run();
    database.insert(recoveryRequests).values({ id: "delete-recovery", userId: "rejected-user", status: "submitted", method: "email", risk: "low", submittedAt: now }).run();
    database.insert(withdrawalRequests).values({ id: "delete-withdrawal", reference: "NVW-DELETE", idempotencyKey: "withdrawal-delete-0001", userId: "rejected-user", accountId: "rejected-account", amountMinor: 100, currency: "USD", status: "pending", submittedAt: now, updatedAt: now }).run();
    database.insert(currencyChangeRequests).values({ id: "delete-currency-change", userId: "rejected-user", accountId: "rejected-account", currentCurrency: "USD", requestedCurrency: "EUR", status: "pending", requestedAt: now, updatedAt: now }).run();
    const { deleteUser } = await import("./users/user-deletion-service");
    const { reviewCurrencyChange } = await import("./accounts/currency-change-service");
    expect(() => deleteUser({ actorId: "last-super", actorLabel: "last-super@example.test", actorRole: "super_admin", targetUserId: "rejected-user", confirmation: "WRONG" })).toThrow("DELETE USER");
    expect(database.select().from(credentials).where(eq(credentials.userId, "rejected-user")).get()).toBeTruthy();
    deleteUser({ actorId: "last-super", actorLabel: "last-super@example.test", actorRole: "super_admin", targetUserId: "rejected-user", confirmation: "DELETE USER" });
    expect(database.select().from(users).where(eq(users.id, "rejected-user")).get()).toMatchObject({ name: "Deleted user", status: "deleted", adminRole: null });
    expect(database.select().from(credentials).where(eq(credentials.userId, "rejected-user")).get()).toBeUndefined();
    expect(database.select().from(authenticationTokens).where(eq(authenticationTokens.userId, "rejected-user")).all()).toHaveLength(0);
    expect(database.select().from(recoveryCodes).where(eq(recoveryCodes.userId, "rejected-user")).all()).toHaveLength(0);
    expect(database.select().from(userProfiles).where(eq(userProfiles.userId, "rejected-user")).all()).toHaveLength(0);
    expect(database.select().from(sessions).where(eq(sessions.userId, "rejected-user")).get()?.revokedAt).toBeTruthy();
    expect(database.select().from(devices).where(eq(devices.userId, "rejected-user")).get()).toMatchObject({ trusted: false });
    expect(database.select().from(currencyChangeRequests).where(eq(currencyChangeRequests.id, "delete-currency-change")).get()?.status).toBe("cancelled");
    expect(() => reviewCurrencyChange({ actorId: "last-super", actorLabel: "last-super@example.test", actorRole: "super_admin", requestId: "delete-currency-change", decision: "approved" })).toThrow("no longer available");
    expect(database.select().from(accounts).where(eq(accounts.userId, "rejected-user")).get()).toBeTruthy();
    expect(database.select().from(recoveryRequests).where(eq(recoveryRequests.userId, "rejected-user")).get()).toBeTruthy();
    expect(database.select().from(withdrawalRequests).where(eq(withdrawalRequests.id, "delete-withdrawal")).get()?.status).toBe("cancelled");
    expect(database.select().from(auditEvents).where(and(eq(auditEvents.target, "rejected-user"), eq(auditEvents.action, "user.delete"))).get()).toBeTruthy();
    const { loginUser } = await import("./auth/auth-service");
    await expect(loginUser({ email: "rejected@example.test", password: "any-password-value", persistent: false })).rejects.toThrow("Invalid email, username, or password");
    const { getAdminWorkspace } = await import("./repositories/workspace-repository");
    expect((await getAdminWorkspace("super_admin")).users.some((user) => user.id === "rejected-user")).toBe(false);
    expect(() => deleteUser({ actorId: "last-super", actorLabel: "last-super@example.test", actorRole: "super_admin", targetUserId: "rejected-user", confirmation: "DELETE USER" })).toThrow("not available");
  });
});

describe("administrator customer operations", () => {
  it("credits an owned customer ledger once and persists every side effect", async () => {
    const now = new Date().toISOString();
    database.insert(users).values({ id: "credit-admin", name: "Credit Admin", email: "credit-admin@example.test", avatarInitials: "CA", status: "active", locale: "en", adminRole: "administrator", createdAt: now, updatedAt: now }).onConflictDoNothing().run();
    const { creditUserAccount } = await import("./admin/admin-credit-service");
    const input = { actorId: "credit-admin", actorLabel: "credit-admin@example.test", actorRole: "administrator" as const, accountId: "test-account", amountMinor: 7500, currency: "USD" as const, reason: "Approved service adjustment", idempotencyKey: "admin-credit-integration-0001" };
    const before = database.select().from(accounts).where(eq(accounts.id, "test-account")).get()!.balanceMinor;
    const reference = creditUserAccount(input);
    expect(creditUserAccount(input)).toBe(reference);
    expect(database.select().from(accounts).where(eq(accounts.id, "test-account")).get()!.balanceMinor).toBe(before + 7500);
    expect(database.select().from(adminCredits).where(eq(adminCredits.reference, reference)).all()).toHaveLength(1);
    expect(database.select().from(transactions).where(eq(transactions.reference, reference)).get()).toMatchObject({ createdBy: "credit-admin", amountMinor: 7500, currency: "USD" });
    expect(database.select().from(notifications).where(eq(notifications.eventReference, reference)).get()?.userId).toBe("test-user");
    expect(database.select().from(emailOutbox).where(eq(emailOutbox.eventReference, `${reference}:credited`)).get()).toBeTruthy();
    expect(database.select().from(auditEvents).where(eq(auditEvents.target, reference)).get()?.action).toBe("account.admin_credit");
  });

  it.each(["USD", "EUR", "JPY", "KRW", "TWD", "KWD"] as const)("credits a %s account only in its ledger currency", async (currency) => {
    const now = new Date().toISOString();
    const suffix = currency.toLowerCase();
    const userId = `credit-user-${suffix}`;
    const accountId = `credit-account-${suffix}`;
    database.insert(users).values({ id: userId, name: `${currency} Credit User`, email: `credit-${suffix}@example.test`, avatarInitials: currency.slice(0, 2), status: "active", locale: "en", displayCurrency: currency, createdAt: now, updatedAt: now }).run();
    database.insert(accounts).values({ id: accountId, userId, name: `${currency} Account`, number: `7000000${String(["USD", "EUR", "JPY", "KRW", "TWD", "KWD"].indexOf(currency) + 1).padStart(3, "0")}`, type: "personal", currency, balanceMinor: 10_000, status: "active", createdAt: now, updatedAt: now }).run();
    const { getAdminWorkspace } = await import("./repositories/workspace-repository");
    expect((await getAdminWorkspace("administrator")).accounts.find((account) => account.id === accountId)?.currency).toBe(currency);
    const { creditUserAccount } = await import("./admin/admin-credit-service");
    const reference = creditUserAccount({ actorId: "credit-admin", actorLabel: "credit-admin@example.test", actorRole: "administrator", accountId, amountMinor: 1234, currency, reason: `${currency} ledger regression`, idempotencyKey: `admin-credit-${suffix}-currency-0001` });
    expect(database.select().from(accounts).where(eq(accounts.id, accountId)).get()?.balanceMinor).toBe(11_234);
    expect(database.select().from(transactions).where(eq(transactions.reference, reference)).get()).toMatchObject({ accountId, amountMinor: 1234, currency });
    expect(database.select().from(adminCredits).where(eq(adminCredits.reference, reference)).get()).toMatchObject({ accountId, amountMinor: 1234, currency });
  });

  it("rejects a different submitted currency without changing the account ledger", async () => {
    const { creditUserAccount } = await import("./admin/admin-credit-service");
    const accountId = "credit-account-krw";
    const before = database.select().from(accounts).where(eq(accounts.id, accountId)).get()!.balanceMinor;
    expect(() => creditUserAccount({ actorId: "credit-admin", actorLabel: "credit-admin@example.test", actorRole: "administrator", accountId, amountMinor: 100, currency: "USD", reason: "Mismatched currency regression", idempotencyKey: "admin-credit-krw-mismatch-0001" })).toThrow("does not match the account ledger");
    expect(database.select().from(accounts).where(eq(accounts.id, accountId)).get()?.balanceMinor).toBe(before);
    expect(database.select().from(adminCredits).where(eq(adminCredits.idempotencyKey, "admin-credit-krw-mismatch-0001")).get()).toBeUndefined();
  });

  it("denies account credits without permission and leaves the balance unchanged", async () => {
    const { creditUserAccount } = await import("./admin/admin-credit-service");
    const before = database.select().from(accounts).where(eq(accounts.id, "test-account")).get()!.balanceMinor;
    expect(() => creditUserAccount({ actorId: "credit-admin", actorLabel: "credit-admin@example.test", actorRole: "auditor", accountId: "test-account", amountMinor: 100, currency: "USD", reason: "Not permitted", idempotencyKey: "admin-credit-denied-0001" })).toThrow("not permitted");
    expect(database.select().from(accounts).where(eq(accounts.id, "test-account")).get()!.balanceMinor).toBe(before);
  });

  it("suspends and restores a customer with immutable history and revoked access", async () => {
    const now = new Date().toISOString();
    database.insert(sessions).values({ id: "suspension-session", userId: "test-user", tokenHash: "suspension-token", expiresAt: "2099-01-01T00:00:00Z", lastActiveAt: now, createdAt: now }).run();
    database.insert(devices).values({ id: "suspension-device", userId: "test-user", sessionId: "suspension-session", name: "Suspension device", browser: "Test", location: "Test", lastActiveAt: now, loginAt: now, trusted: true }).run();
    const { changeUserStatus } = await import("./admin/user-status-service");
    changeUserStatus({ actorId: "credit-admin", actorLabel: "credit-admin@example.test", actorRole: "administrator", userId: "test-user", nextStatus: "suspended", reason: "Security review required" });
    expect(database.select().from(users).where(eq(users.id, "test-user")).get()).toMatchObject({ status: "suspended", suspensionReason: "Security review required", suspendedBy: "credit-admin" });
    expect(database.select().from(sessions).where(eq(sessions.id, "suspension-session")).get()?.revokedAt).toBeTruthy();
    expect(database.select().from(devices).where(eq(devices.id, "suspension-device")).get()).toMatchObject({ trusted: false });
    changeUserStatus({ actorId: "credit-admin", actorLabel: "credit-admin@example.test", actorRole: "administrator", userId: "test-user", nextStatus: "active", reason: "Security review completed" });
    expect(database.select().from(users).where(eq(users.id, "test-user")).get()).toMatchObject({ status: "active", suspensionReason: null });
    expect(database.select().from(userStatusChanges).where(eq(userStatusChanges.userId, "test-user")).all()).toHaveLength(2);
    expect(database.select().from(auditEvents).where(eq(auditEvents.target, "test-user")).all().map((row) => row.action)).toEqual(expect.arrayContaining(["user.suspend", "user.unsuspend"]));
  });
});

describe("administrator customer messaging", () => {
  beforeAll(() => {
    const now = new Date().toISOString();
    database.insert(users).values([
      { id: "message-admin", name: "Message Admin", email: "message-admin@example.test", avatarInitials: "MA", status: "active", locale: "en", adminRole: "administrator", createdAt: now, updatedAt: now },
      { id: "message-customer", name: "Message Customer", email: "message-customer@example.test", avatarInitials: "MC", status: "active", locale: "en", createdAt: now, updatedAt: now },
    ]).run();
  });

  it("sends to the database-owned recipient once and records delivery history and audit", async () => {
    vi.stubEnv("APP_URL", "https://citizavrexo.com");
    const { sendAdminMessage } = await import("./admin/admin-message-service");
    let delivered: { to: string; subject: string; text: string; html?: string; idempotencyKey: string } | undefined;
    const send = vi.fn(async (message: { to: string; subject: string; text: string; html?: string; idempotencyKey: string }) => { delivered = message; });
    const input = { actorId: "message-admin", actorLabel: "ignored@example.test", actorRole: "administrator" as const, recipientUserId: "message-customer", subject: "Account update", message: "Your <account> review is complete.\nThank you.", idempotencyKey: "admin-message-success-0001" };

    const sent = await sendAdminMessage(input, { send });
    const duplicate = await sendAdminMessage(input, { send });

    expect(duplicate.id).toBe(sent.id);
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      to: "message-customer@example.test",
      subject: "CITIZAVREXO · Account update",
      text: expect.stringContaining("https://citizavrexo.com/login?returnTo=/app"),
      html: expect.stringMatching(/Banking made beautifully simple\.[\s\S]*Open CITIZAVREXO/),
    }));
    const deliveredHtml = delivered!.html!;
    expect(deliveredHtml).toContain("Your &lt;account&gt; review is complete.");
    expect(deliveredHtml).not.toContain("Your <account>");
    expect(database.select().from(adminMessages).where(eq(adminMessages.id, sent.id)).get()).toMatchObject({ recipientUserId: "message-customer", recipientName: "Message Customer", recipientEmail: "message-customer@example.test", subject: "Account update", deliveryStatus: "sent" });
    expect(database.select().from(auditEvents).where(and(eq(auditEvents.target, "message-customer"), eq(auditEvents.action, "admin.message.send"), eq(auditEvents.result, "success"))).get()).toMatchObject({ actorId: "message-admin", actorLabel: "message-admin@example.test" });
    const workspace = await (await import("./repositories/workspace-repository")).getAdminWorkspace("administrator");
    expect(workspace.adminMessages).toContainEqual(expect.objectContaining({ id: sent.id, recipientUserId: "message-customer", deliveryStatus: "sent" }));
  });

  it("rejects unauthorized senders, admin recipients, and invalid content", async () => {
    const { sendAdminMessage } = await import("./admin/admin-message-service");
    const base = { actorId: "message-admin", actorLabel: "message-admin@example.test", recipientUserId: "message-customer", subject: "Notice", message: "A valid customer message.", idempotencyKey: "admin-message-validation-0001" };
    await expect(sendAdminMessage({ ...base, actorRole: "support_agent" }, { send: vi.fn() })).rejects.toThrow("not permitted");
    await expect(sendAdminMessage({ ...base, actorRole: "administrator", recipientUserId: "message-admin", idempotencyKey: "admin-message-validation-0002" }, { send: vi.fn() })).rejects.toThrow("no longer available");
    await expect(sendAdminMessage({ ...base, actorRole: "administrator", subject: "", idempotencyKey: "admin-message-validation-0003" }, { send: vi.fn() })).rejects.toThrow("allowed lengths");
    expect(database.select().from(adminMessages).where(eq(adminMessages.idempotencyKey, "admin-message-validation-0003")).get()).toBeUndefined();
  });

  it("records a failed delivery without exposing provider details", async () => {
    vi.stubEnv("APP_URL", "https://citizavrexo.com");
    const { sendAdminMessage } = await import("./admin/admin-message-service");
    const send = vi.fn(async () => { throw new Error("provider-secret-detail"); });
    await expect(sendAdminMessage({ actorId: "message-admin", actorLabel: "message-admin@example.test", actorRole: "administrator", recipientUserId: "message-customer", subject: "Delivery test", message: "This message should report a safe failure.", idempotencyKey: "admin-message-failure-0001" }, { send })).rejects.toThrow("Email delivery failed");
    const failed = database.select().from(adminMessages).where(eq(adminMessages.idempotencyKey, "admin-message-failure-0001")).get();
    expect(failed).toMatchObject({ deliveryStatus: "failed", recipientEmail: "message-customer@example.test" });
    expect(database.select().from(auditEvents).where(and(eq(auditEvents.target, "message-customer"), eq(auditEvents.action, "admin.message.send"), eq(auditEvents.result, "failed"))).get()).toBeTruthy();
    expect(JSON.stringify(database.select().from(emailOutbox).where(eq(emailOutbox.id, failed!.outboxId)).get())).not.toContain("provider-secret-detail");
  });
});
