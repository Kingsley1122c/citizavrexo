import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { hasPermission } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { accounts, auditEvents, cardRequests, cards, emailOutbox, notifications, userProfiles, users } from "@/lib/db/schema";
import type { AdminRole, CardRequestStatus } from "@/lib/domain";
import { userUi } from "@/lib/i18n/user-ui";
import { currencyFractionDigits } from "@/lib/currency";

const labelSchema = z.string().trim().min(2).max(40).regex(/^[^\p{Cc}\p{Cf}]+$/u);
const rejectionSchema = z.string().trim().min(3).max(240).regex(/^[^\p{Cc}\p{Cf}]+$/u);

export class CardRequestError extends Error {}
const publicReference = (requestId: string) => `NCR-${createHash("sha256").update(requestId).digest("hex").slice(0, 10).toUpperCase()}`;

export function createCardRequest(input: { userId: string; actorLabel: string; accountId: string; label: string; monthlyLimitMinor: number }): string {
  const label = labelSchema.parse(input.label);
  const now = new Date().toISOString();
  const requestId = randomUUID();
  db.transaction((tx) => {
    const account = tx.select({ id: accounts.id, currency: accounts.currency, email: users.email, name: users.name, locale: users.locale }).from(accounts).innerJoin(users, eq(accounts.userId, users.id)).where(and(eq(accounts.id, input.accountId), eq(accounts.userId, input.userId), eq(accounts.status, "active"), eq(users.status, "active"))).get();
    if (!account) throw new CardRequestError("The selected account is not eligible for a card request.");
    const scale = 10 ** currencyFractionDigits(account.currency);
    if (!Number.isSafeInteger(input.monthlyLimitMinor) || input.monthlyLimitMinor < 100 * scale || input.monthlyLimitMinor > 1_000_000 * scale) throw new CardRequestError("The monthly limit must be between 100 and 1,000,000 in the account currency.");
    const profile = tx.select().from(userProfiles).where(eq(userProfiles.userId, input.userId)).get();
    if (!profile || profile.reviewStatus !== "approved") throw new CardRequestError("Your profile must be approved before requesting a physical card.");
    const pending = tx.select({ id: cardRequests.id }).from(cardRequests).where(and(eq(cardRequests.userId, input.userId), eq(cardRequests.status, "pending"))).get();
    if (pending) throw new CardRequestError("A card request is already pending approval.");
    const reference = publicReference(requestId);
    const t = userUi(account.locale);
    tx.insert(cardRequests).values({ id: requestId, userId: input.userId, accountId: account.id, label, cardType: "physical", monthlyLimitMinor: input.monthlyLimitMinor, currency: account.currency, status: "pending", submittedAt: now, updatedAt: now }).run();
    tx.insert(notifications).values({ id: randomUUID(), userId: input.userId, kind: "system", title: "Physical card request submitted", message: "Your physical card request is pending review.", eventReference: `${reference}:submitted`, important: false, createdAt: now }).run();
    tx.insert(emailOutbox).values({ id: randomUUID(), recipient: account.email, event: "important_account_notification", eventReference: `${reference}:submitted`, payloadJson: JSON.stringify({ to: account.email, locale: account.locale, event: "important_account_notification", eventReference: reference, displayName: account.name, summary: t.notifications.messageCardPending }), status: "pending", createdAt: now }).run();
    tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: input.userId, actorLabel: input.actorLabel, action: "card_request.create", target: requestId, result: "success", metadataJson: JSON.stringify({ accountId: account.id }), timestamp: now }).run();
  });
  return requestId;
}

export function reviewCardRequest(input: { actorId: string; actorLabel: string; actorRole: AdminRole | null; requestId: string; decision: Extract<CardRequestStatus, "approved" | "rejected">; rejectionReason?: string }): { cardId?: string } {
  if (!hasPermission(input.actorRole, "cards.review")) throw new CardRequestError("Card request review is not permitted.");
  const rejectionReason = input.decision === "rejected" ? rejectionSchema.parse(input.rejectionReason) : undefined;
  const now = new Date().toISOString();
  return db.transaction((tx) => {
    const request = tx.select({ request: cardRequests, user: users, account: accounts }).from(cardRequests).innerJoin(users, eq(cardRequests.userId, users.id)).innerJoin(accounts, eq(cardRequests.accountId, accounts.id)).where(eq(cardRequests.id, input.requestId)).get();
    if (!request || request.request.status !== "pending" || request.user.status !== "active" || request.account.userId !== request.user.id) throw new CardRequestError("This card request is no longer available for review.");
    if (request.user.id === input.actorId) throw new CardRequestError("Administrators cannot review their own card requests.");
    if (request.request.currency !== request.account.currency) throw new CardRequestError("The account currency changed. The card request can no longer be approved.");
    let cardId: string | undefined;
    if (input.decision === "approved") {
      cardId = randomUUID();
      const expiresAt = new Date();
      expiresAt.setUTCFullYear(expiresAt.getUTCFullYear() + 3);
      const expires = `${String(expiresAt.getUTCMonth() + 1).padStart(2, "0")}/${String(expiresAt.getUTCFullYear()).slice(-2)}`;
      const lastFour = String(randomBytes(2).readUInt16BE() % 10_000).padStart(4, "0");
      tx.insert(cards).values({ id: cardId, accountId: request.account.id, label: request.request.label, cardType: "physical", lastFour, expires, status: "active", monthlyLimitMinor: request.request.monthlyLimitMinor, monthlySpentMinor: 0, onlinePayments: true, contactlessPayments: true, createdAt: now, updatedAt: now }).run();
    }
    const update = tx.update(cardRequests).set({ status: input.decision, cardId, rejectionReason, reviewedBy: input.actorId, reviewedAt: now, updatedAt: now }).where(and(eq(cardRequests.id, request.request.id), eq(cardRequests.status, "pending"))).run();
    if (update.changes !== 1) throw new CardRequestError("This card request was already reviewed.");
    const approved = input.decision === "approved";
    const reference = publicReference(request.request.id);
    const t = userUi(request.user.locale);
    tx.insert(notifications).values({ id: randomUUID(), userId: request.user.id, kind: "system", title: `Physical card request ${input.decision}`, message: approved ? "Your physical card is now available in Cards." : "Your physical card request was not approved.", eventReference: `${reference}:${input.decision}`, important: true, createdAt: now }).run();
    tx.insert(emailOutbox).values({ id: randomUUID(), recipient: request.user.email, event: "important_account_notification", eventReference: `${reference}:${input.decision}`, payloadJson: JSON.stringify({ to: request.user.email, locale: request.user.locale, event: "important_account_notification", eventReference: reference, displayName: request.user.name, summary: approved ? t.notifications.messageCardAvailable : t.notifications.messageCardRejected }), status: "pending", createdAt: now }).run();
    tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: input.actorId, actorLabel: input.actorLabel, action: `card_request.${input.decision}`, target: request.request.id, result: "success", metadataJson: JSON.stringify({ requestId: request.request.id, cardId: cardId ?? "", userId: request.user.id }), timestamp: now }).run();
    return { cardId };
  });
}