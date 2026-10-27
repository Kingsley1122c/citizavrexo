import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { accounts, auditEvents, cards } from "@/lib/db/schema";

export type MutableCardStatus = "active" | "frozen";
export type CardCapability = "onlinePayments" | "contactlessPayments";

export function toggleOwnedCardFreeze(userId: string, actorLabel: string, cardId: string): MutableCardStatus | null {
  return db.transaction((tx) => {
    const card = tx.select({ id: cards.id, status: cards.status }).from(cards).innerJoin(accounts, eq(cards.accountId, accounts.id)).where(and(eq(cards.id, cardId), eq(accounts.userId, userId))).get();
    if (!card || card.status === "expired") return null;
    const status: MutableCardStatus = card.status === "frozen" ? "active" : "frozen";
    const now = new Date().toISOString();
    const update = tx.update(cards).set({ status, updatedAt: now }).where(and(eq(cards.id, card.id), eq(cards.status, card.status))).run();
    if (update.changes !== 1) throw new Error("The card status changed concurrently. Retry the request.");
    tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: userId, actorLabel, action: `card.${status}`, target: card.id, result: "success", metadataJson: "{}", timestamp: now }).run();
    return status;
  });
}

export function toggleOwnedCardCapability(userId: string, actorLabel: string, cardId: string, capability: CardCapability): boolean | null {
  return db.transaction((tx) => {
    const card = tx.select({ id: cards.id, status: cards.status, onlinePayments: cards.onlinePayments, contactlessPayments: cards.contactlessPayments }).from(cards).innerJoin(accounts, eq(cards.accountId, accounts.id)).where(and(eq(cards.id, cardId), eq(accounts.userId, userId))).get();
    if (!card || card.status === "expired") return null;
    const previous = card[capability];
    const enabled = !previous;
    const now = new Date().toISOString();
    const update = tx.update(cards).set({ [capability]: enabled, updatedAt: now }).where(and(eq(cards.id, card.id), eq(cards[capability], previous))).run();
    if (update.changes !== 1) throw new Error("The card control changed concurrently. Retry the request.");
    tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: userId, actorLabel, action: `card.${capability}.${enabled ? "enabled" : "disabled"}`, target: card.id, result: "success", metadataJson: "{}", timestamp: now }).run();
    return enabled;
  });
}