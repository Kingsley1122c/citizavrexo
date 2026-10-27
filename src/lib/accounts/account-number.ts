import "server-only";

import { randomInt } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { accounts } from "@/lib/db/schema";

const minimumAccountNumber = 1_000_000_000;
const maximumAccountNumber = 10_000_000_000;

export function generateAccountNumber(isTaken: (number: string) => boolean, nextNumber = () => randomInt(minimumAccountNumber, maximumAccountNumber)): string {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const candidate = String(nextNumber());
    if (!/^\d{10}$/.test(candidate)) throw new Error("Account number generation failed.");
    if (!isTaken(candidate)) return candidate;
  }
  throw new Error("A unique account number could not be generated.");
}

export function createUniqueAccountNumber(): string {
  return generateAccountNumber((number) => Boolean(db.select({ id: accounts.id }).from(accounts).where(eq(accounts.number, number)).get()));
}