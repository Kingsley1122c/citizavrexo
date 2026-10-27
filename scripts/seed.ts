import { mkdirSync } from "node:fs";
import { hash } from "@node-rs/argon2";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { accounts, auditEvents, bankDestinations, cards, credentials, devices, notifications, recoveryRequests, transactions, users } from "../src/lib/db/schema";
import { assertDevelopmentSeedEnvironment } from "../src/lib/db/seed-guard";

assertDevelopmentSeedEnvironment();
mkdirSync("./data", { recursive: true });
const sqlite = new Database(process.env.DATABASE_URL?.replace(/^file:/, "") ?? "./data/nivora.db");
sqlite.pragma("foreign_keys = ON");
const database = drizzle(sqlite);
const now = "2026-09-11T10:12:00Z";
const passwordOptions = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

async function seed() {
  const userPassword = await hash("NivoraDemo!2026", passwordOptions);
  const recipientPassword = await hash("NivoraRecipient!2026", passwordOptions);
  const adminPassword = await hash("NivoraAdmin!2026", passwordOptions);
  database.transaction((tx) => {
    tx.insert(users).values([
      { id: "usr_01", name: "Amara Okafor", email: "amara@example.test", avatarInitials: "AO", status: "active", emailVerifiedAt: "2026-01-12T10:00:00Z", locale: "en", createdAt: "2026-01-12T09:30:00Z", updatedAt: now },
      { id: "usr_02", name: "Tunde Bello", email: "tunde@example.test", avatarInitials: "TB", status: "active", emailVerifiedAt: "2026-01-13T10:00:00Z", locale: "en", createdAt: "2026-01-13T09:30:00Z", updatedAt: now },
      { id: "admin_01", name: "Maya Chen", email: "admin@example.test", avatarInitials: "MC", status: "active", emailVerifiedAt: "2026-01-02T10:00:00Z", locale: "en", adminRole: "super_admin", createdAt: "2026-01-02T09:30:00Z", updatedAt: now },
    ]).onConflictDoNothing().run();
    tx.insert(credentials).values([{ userId: "usr_01", passwordHash: userPassword, passwordChangedAt: now }, { userId: "usr_02", passwordHash: recipientPassword, passwordChangedAt: now }, { userId: "admin_01", passwordHash: adminPassword, passwordChangedAt: now }]).onConflictDoNothing().run();
    tx.insert(accounts).values([
      { id: "personal", userId: "usr_01", name: "Personal Account", number: "2048730964", type: "personal", currency: "USD", balanceMinor: 125035000, status: "active", createdAt: now, updatedAt: now },
      { id: "savings", userId: "usr_01", name: "Savings Account", number: "2048730981", type: "savings", currency: "USD", balanceMinor: 82040000, status: "active", createdAt: now, updatedAt: now },
      { id: "dollar", userId: "usr_01", name: "Dollar Account", number: "2048731022", type: "personal", currency: "USD", balanceMinor: 284075, status: "active", createdAt: now, updatedAt: now },
      { id: "recipient-personal", userId: "usr_02", name: "Personal Account", number: "2048731118", type: "personal", currency: "USD", balanceMinor: 2500000, status: "active", createdAt: now, updatedAt: now },
    ]).onConflictDoNothing().run();
    tx.insert(bankDestinations).values([
      { id: "destination-main", userId: "usr_01", label: "Main bank", bankName: "Primary Bank", accountName: "Amara Okafor", accountNumber: "0123456789", currency: "USD", createdAt: now, updatedAt: now },
      { id: "destination-usd", userId: "usr_01", label: "Dollar account", bankName: "International Bank", accountName: "Amara Okafor", accountNumber: "US1234567890", currency: "USD", createdAt: now, updatedAt: now },
    ]).onConflictDoNothing().run();
    tx.insert(transactions).values([
      { id: "txn_01", reference: "NVC-260908-A82F", accountId: "personal", type: "credit", description: "Salary Credit", amountMinor: 25000000, currency: "USD", occurredAt: "2026-09-08T09:14:00Z", status: "completed", balanceBeforeMinor: 100035000, balanceAfterMinor: 125035000, createdBy: "system", createdAt: now },
      { id: "txn_02", reference: "NVC-260907-B19K", accountId: "personal", type: "transfer", description: "Transfer", amountMinor: -5000000, currency: "USD", occurredAt: "2026-09-07T14:22:00Z", status: "completed", balanceBeforeMinor: 105035000, balanceAfterMinor: 100035000, createdBy: "system", createdAt: now },
      { id: "txn_03", reference: "NVC-260905-M72P", accountId: "savings", type: "credit", description: "Investment Return", amountMinor: 12500000, currency: "USD", occurredAt: "2026-09-05T11:06:00Z", status: "completed", balanceBeforeMinor: 69540000, balanceAfterMinor: 82040000, createdBy: "system", createdAt: now },
      { id: "txn_04", reference: "NVC-260903-J31Q", accountId: "personal", type: "card", description: "Card Payment", amountMinor: -1250000, currency: "USD", occurredAt: "2026-09-03T18:41:00Z", status: "completed", balanceBeforeMinor: 106285000, balanceAfterMinor: 105035000, createdBy: "system", createdAt: now },
    ]).onConflictDoNothing().run();
    tx.insert(cards).values([
      { id: "card_01", accountId: "personal", label: "Everyday Card", lastFour: "4826", expires: "08/29", status: "active", monthlyLimitMinor: 50000000, monthlySpentMinor: 14625000, onlinePayments: true, contactlessPayments: true, createdAt: now, updatedAt: now },
      { id: "card_02", accountId: "savings", label: "Reserve Card", lastFour: "1038", expires: "11/28", status: "frozen", monthlyLimitMinor: 25000000, monthlySpentMinor: 1800000, onlinePayments: false, contactlessPayments: false, createdAt: now, updatedAt: now },
    ]).onConflictDoNothing().run();
    tx.insert(notifications).values([
      { id: "ntf_01", userId: "usr_01", kind: "security", title: "New device verified", message: "Chrome on Windows was verified in Lagos, Nigeria.", createdAt: now, important: true, eventReference: "SEC-92AH" },
      { id: "ntf_02", userId: "usr_01", kind: "credit", title: "Account credited", message: "Your Personal Account received USD 250,000.00.", createdAt: "2026-09-08T09:14:00Z", important: false, eventReference: "NVC-260908-A82F" },
      { id: "ntf_03", userId: "usr_01", kind: "transaction", title: "Transaction completed", message: "Your transfer was completed successfully.", createdAt: "2026-09-07T14:22:00Z", important: false, readAt: "2026-09-07T15:00:00Z", eventReference: "NVC-260907-B19K" },
    ]).onConflictDoNothing().run();
    tx.insert(devices).values([
      { id: "dev_01", userId: "usr_01", name: "Windows laptop", browser: "Chrome", location: "Lagos, Nigeria", lastActiveAt: now, loginAt: "2026-09-11T08:42:00Z", trusted: true },
      { id: "dev_02", userId: "usr_01", name: "iPhone", browser: "Nivora Web", location: "Lagos, Nigeria", lastActiveAt: "2026-09-10T19:33:00Z", loginAt: "2026-08-22T12:10:00Z", trusted: true },
    ]).onConflictDoNothing().run();
    tx.insert(recoveryRequests).values([{ id: "RCV-2049", userId: "usr_01", submittedAt: "2026-09-11T07:20:00Z", status: "under_review", method: "support", risk: "medium" }]).onConflictDoNothing().run();
    tx.insert(auditEvents).values([{ id: "AUD-77103", actorId: "usr_01", actorLabel: "System", action: "device.verify", target: "usr_01", timestamp: "2026-09-11T08:45:00Z", result: "success", metadataJson: JSON.stringify({ device: "dev_01" }) }]).onConflictDoNothing().run();
  });
  sqlite.close();
  console.log("Nivora development database seeded.");
}

seed().catch((error) => { console.error(error); process.exitCode = 1; });