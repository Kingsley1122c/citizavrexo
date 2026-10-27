import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditEvents, bankDestinations } from "@/lib/db/schema";
import type { BankDestination, Currency } from "@/lib/domain";

export class BankDestinationError extends Error {}

const clean = (value: string) => value.trim().replace(/\s+/g, " ");

export function createBankDestination(input: { userId: string; actorLabel: string; label: string; bankName: string; accountName: string; accountNumber: string; country: string; destinationType: "bank_account"; currency: Currency }): BankDestination {
  const label = clean(input.label);
  const bankName = clean(input.bankName);
  const accountName = clean(input.accountName);
  const accountNumber = clean(input.accountNumber).replaceAll(" ", "");
  const country = input.country.trim().toUpperCase();
  const countryAccountValid = country === "NG" ? /^\d{10}$/.test(accountNumber) : country === "US" ? /^\d{6,17}$/.test(accountNumber) : /^[A-Za-z0-9-]{6,34}$/.test(accountNumber);
  if (label.length < 2 || label.length > 40 || bankName.length < 2 || bankName.length > 100 || accountName.length < 2 || accountName.length > 100 || !/^[A-Z]{2}$/.test(country) || input.destinationType !== "bank_account" || !countryAccountValid) {
    throw new BankDestinationError("Check the bank account details and try again.");
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  try {
    db.transaction((tx) => {
      tx.insert(bankDestinations).values({ id, userId: input.userId, label, bankName, accountName, accountNumber, country, destinationType: input.destinationType, currency: input.currency, createdAt: now, updatedAt: now }).run();
      tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: input.userId, actorLabel: input.actorLabel, action: "bank_destination.create", target: id, result: "success", metadataJson: JSON.stringify({ currency: input.currency, country, destinationType: input.destinationType, bankName }), timestamp: now }).run();
    });
  } catch {
    throw new BankDestinationError("That bank account is already saved.");
  }
  return { id, label, bankName, accountName, accountNumber, country, destinationType: input.destinationType, currency: input.currency };
}

export function deleteOwnedBankDestination(input: { userId: string; actorLabel: string; destinationId: string }): void {
  const now = new Date().toISOString();
  db.transaction((tx) => {
    const removed = tx.delete(bankDestinations).where(and(eq(bankDestinations.id, input.destinationId), eq(bankDestinations.userId, input.userId))).run();
    if (removed.changes !== 1) throw new BankDestinationError("The bank destination is not available.");
    tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: input.userId, actorLabel: input.actorLabel, action: "bank_destination.delete", target: input.destinationId, result: "success", metadataJson: "{}", timestamp: now }).run();
  });
}
