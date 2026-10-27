import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { hash } from "@node-rs/argon2";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { accounts, cardRequests, cards, credentials, transactions, users, withdrawalRequests } from "../src/lib/db/schema";
import { assertQaFixtureEnvironment } from "../src/lib/db/seed-guard";
import { currencyFractionDigits, type Currency } from "../src/lib/currency";

const databasePath = assertQaFixtureEnvironment();
const credentialsPath = resolve("data/qa-credentials.json");
mkdirSync(dirname(databasePath), { recursive: true });
rmSync(databasePath, { force: true });
rmSync(`${databasePath}-shm`, { force: true });
rmSync(`${databasePath}-wal`, { force: true });

const sqlite = new Database(databasePath);
sqlite.pragma("foreign_keys = ON");
const database = drizzle(sqlite);
const passwordOptions = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
const currencies = ["USD", "KRW", "TWD", "JPY", "HKD", "SGD", "CNY", "THB", "VND", "IDR", "MYR", "INR", "PHP", "GBP", "EUR", "KWD"] as const satisfies readonly Currency[];

async function seedQa() {
  migrate(database, { migrationsFolder: resolve("drizzle") });
  const password = `Qa!${randomBytes(18).toString("base64url")}`;
  const passwordHash = await hash(password, passwordOptions);
  const now = new Date().toISOString();
  const primaryUserId = "qa-local-customer";
  const recipientUserId = "qa-local-recipient";
  const adminUserId = "qa-local-admin";

  database.transaction((tx) => {
    tx.insert(users).values([
      { id: primaryUserId, name: "Local QA Customer", email: "qa.customer@local.test", avatarInitials: "QC", status: "active", emailVerifiedAt: now, locale: "en", displayCurrency: "USD", createdAt: now, updatedAt: now },
      { id: recipientUserId, name: "Verified QA Recipient", email: "qa.recipient@local.test", avatarInitials: "QR", status: "active", emailVerifiedAt: now, locale: "ja", displayCurrency: "JPY", createdAt: now, updatedAt: now },
      { id: adminUserId, name: "Local QA Currency Reviewer", email: "qa.admin@local.test", avatarInitials: "QA", status: "active", emailVerifiedAt: now, locale: "en", displayCurrency: "USD", adminRole: "administrator", createdAt: now, updatedAt: now },
    ]).run();
    tx.insert(credentials).values([
      { userId: primaryUserId, passwordHash, passwordChangedAt: now },
      { userId: recipientUserId, passwordHash, passwordChangedAt: now },
      { userId: adminUserId, passwordHash, passwordChangedAt: now },
    ]).run();

    const senderAccounts = currencies.map((currency, index) => ({ id: `qa-sender-${currency.toLowerCase()}`, userId: primaryUserId, name: `${currency} QA Account`, number: String(9100000000 + index), type: "personal" as const, currency, balanceMinor: 10_000 * 10 ** currencyFractionDigits(currency), status: "active" as const, createdAt: now, updatedAt: now }));
    const recipientAccounts = currencies.map((currency, index) => ({ id: `qa-recipient-${currency.toLowerCase()}`, userId: recipientUserId, name: `${currency} Recipient`, number: String(9200000000 + index), type: "personal" as const, currency, balanceMinor: 1_000 * 10 ** currencyFractionDigits(currency), status: "active" as const, createdAt: now, updatedAt: now }));
    tx.insert(accounts).values([...senderAccounts, ...recipientAccounts, { id: "qa-change-zero", userId: primaryUserId, name: "Currency Change Clean", number: "9300000001", type: "personal", currency: "USD", balanceMinor: 0, status: "active", createdAt: now, updatedAt: now }, { id: "qa-change-nonzero", userId: primaryUserId, name: "Currency Change Funded", number: "9300000002", type: "personal", currency: "USD", balanceMinor: 100, status: "active", createdAt: now, updatedAt: now }, { id: "qa-change-withdrawal", userId: primaryUserId, name: "Currency Change Withdrawal", number: "9300000003", type: "personal", currency: "USD", balanceMinor: 0, status: "active", createdAt: now, updatedAt: now }, { id: "qa-change-card", userId: primaryUserId, name: "Currency Change Active Card", number: "9300000004", type: "personal", currency: "USD", balanceMinor: 0, status: "active", createdAt: now, updatedAt: now }, { id: "qa-change-card-request", userId: primaryUserId, name: "Currency Change Pending Card", number: "9300000005", type: "personal", currency: "USD", balanceMinor: 0, status: "active", createdAt: now, updatedAt: now }]).run();
    tx.insert(withdrawalRequests).values({ id: "qa-pending-withdrawal", reference: "QA-WITHDRAWAL", idempotencyKey: "qa-pending-withdrawal", userId: primaryUserId, accountId: "qa-change-withdrawal", amountMinor: 1, currency: "USD", status: "pending", submittedAt: now, updatedAt: now }).run();
    tx.insert(cards).values({ id: "qa-active-card", accountId: "qa-change-card", label: "QA active card", lastFour: "9004", expires: "12/30", status: "active", monthlyLimitMinor: 100, monthlySpentMinor: 0, onlinePayments: true, contactlessPayments: true, createdAt: now, updatedAt: now }).run();
    tx.insert(cardRequests).values({ id: "qa-pending-card-request", userId: primaryUserId, accountId: "qa-change-card-request", label: "QA pending card", monthlyLimitMinor: 100, status: "pending", submittedAt: now, updatedAt: now }).run();
    tx.insert(transactions).values([{ id: "qa-history-credit", reference: "QA-HISTORY-CREDIT", accountId: "qa-change-zero", type: "credit", description: "QA historical credit", amountMinor: 100, currency: "USD", occurredAt: now, status: "completed", balanceBeforeMinor: 0, balanceAfterMinor: 100, createdBy: primaryUserId, createdAt: now }, { id: "qa-history-debit", reference: "QA-HISTORY-DEBIT", accountId: "qa-change-zero", type: "debit", description: "QA historical debit", amountMinor: -100, currency: "USD", occurredAt: now, status: "completed", balanceBeforeMinor: 100, balanceAfterMinor: 0, createdBy: primaryUserId, createdAt: now }]).run();
  });

  writeFileSync(credentialsPath, `${JSON.stringify({ database: databasePath, generatedAt: now, customer: { email: "qa.customer@local.test", password }, recipient: { email: "qa.recipient@local.test", password }, administrator: { email: "qa.admin@local.test", password } }, null, 2)}\n`, { mode: 0o600 });
  sqlite.close();
  console.log(`Disposable QA database created at ${databasePath}. Credentials were written to ignored local file ${credentialsPath}.`);
}

seedQa().catch((error: unknown) => {
  if (sqlite.open) sqlite.close();
  console.error(error instanceof Error ? error.message : "QA fixture creation failed.");
  process.exitCode = 1;
});