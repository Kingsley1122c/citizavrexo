import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { administratorTransfers, auditEvents, credentials, devices, sessions, users } from "@/lib/db/schema";
import { passwordSchema } from "@/lib/auth/password-policy";

const emailSchema = z.string().trim().email().max(254);
const nameSchema = z.string().trim().min(2).max(100).regex(/^[^\p{Cc}\p{Cf}]+$/u);
const tokenSchema = z.string().min(32).max(128);
const passwordOptions = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
const hashPassword = async (password: string) => (await import("@node-rs/argon2")).hash(password, passwordOptions);
const verifyPassword = async (passwordHash: string, password: string) => (await import("@node-rs/argon2")).verify(passwordHash, password);
const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");

const unavailableMessage = "Administrator transfer could not be completed.";

export class AdministratorTransferDeliveryUnavailableError extends Error {
  constructor() {
    super("Administrator transfer email delivery is not configured.");
  }
}

export type AdministratorTransferDelivery = (message: {
  recipient: string;
  verificationToken: string;
  expiresAt: string;
}) => Promise<void>;

export async function initiateAdministratorTransfer(input: {
  actorId: string;
  currentPassword: string;
  newEmail: string;
  deliver: AdministratorTransferDelivery;
  now?: Date;
}): Promise<void> {
  const newEmail = emailSchema.parse(input.newEmail).toLowerCase();
  const currentPassword = passwordSchema.parse(input.currentPassword);
  const now = input.now ?? new Date();
  const timestamp = now.toISOString();
  const [actor] = await db.select({ user: users, credential: credentials }).from(users).innerJoin(credentials, eq(users.id, credentials.userId)).where(eq(users.id, input.actorId)).limit(1);
  const reauthenticated = actor ? await verifyPassword(actor.credential.passwordHash, currentPassword) : false;

  if (!actor || actor.user.adminRole !== "super_admin" || actor.user.status !== "active" || !reauthenticated) {
    await db.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: actor?.user.id, actorLabel: actor?.user.email ?? "unknown", action: "admin.transfer.request", target: "administrator-ownership", result: "denied", metadataJson: "{}", timestamp });
    throw new Error(unavailableMessage);
  }

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, newEmail)).limit(1);
  if (existing.length || newEmail === actor.user.email) throw new Error(unavailableMessage);

  const id = randomUUID();
  const verificationToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
  db.transaction((tx) => {
    tx.update(administratorTransfers).set({ cancelledAt: timestamp }).where(and(eq(administratorTransfers.initiatedByUserId, actor.user.id), isNull(administratorTransfers.usedAt), isNull(administratorTransfers.cancelledAt))).run();
    tx.insert(administratorTransfers).values({ id, initiatedByUserId: actor.user.id, newEmail, tokenHash: tokenHash(verificationToken), expiresAt, createdAt: timestamp }).run();
    tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: actor.user.id, actorLabel: actor.user.email, action: "admin.transfer.request", target: id, result: "success", metadataJson: JSON.stringify({ newEmail, expiresAt }), timestamp }).run();
  });

  try {
    await input.deliver({ recipient: newEmail, verificationToken, expiresAt });
  } catch (error) {
    db.transaction((tx) => {
      tx.update(administratorTransfers).set({ cancelledAt: new Date().toISOString() }).where(and(eq(administratorTransfers.id, id), isNull(administratorTransfers.usedAt))).run();
      tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: actor.user.id, actorLabel: actor.user.email, action: "admin.transfer.delivery", target: id, result: "failed", metadataJson: "{}", timestamp: new Date().toISOString() }).run();
    });
    if (error instanceof AdministratorTransferDeliveryUnavailableError) throw error;
    throw new Error(unavailableMessage);
  }
}

export async function completeAdministratorTransfer(input: {
  verificationToken: string;
  newAdministratorName: string;
  newPassword: string;
  now?: Date;
}): Promise<void> {
  const verificationToken = tokenSchema.parse(input.verificationToken);
  const name = nameSchema.parse(input.newAdministratorName);
  const newPassword = passwordSchema.parse(input.newPassword);
  const now = input.now ?? new Date();
  const timestamp = now.toISOString();
  const digest = tokenHash(verificationToken);
  const transfer = await db.select().from(administratorTransfers).where(and(eq(administratorTransfers.tokenHash, digest), isNull(administratorTransfers.usedAt), isNull(administratorTransfers.cancelledAt), gt(administratorTransfers.expiresAt, timestamp))).limit(1).then((rows) => rows[0]);
  if (!transfer) throw new Error(unavailableMessage);

  const [initiator] = await db.select().from(users).where(eq(users.id, transfer.initiatedByUserId)).limit(1);
  const emailInUse = await db.select({ id: users.id }).from(users).where(eq(users.email, transfer.newEmail)).limit(1);
  if (!initiator || initiator.adminRole !== "super_admin" || initiator.status !== "active" || emailInUse.length) throw new Error(unavailableMessage);

  const newUserId = randomUUID();
  const passwordHash = await hashPassword(newPassword);
  db.transaction((tx) => {
    const claim = tx.update(administratorTransfers).set({ usedAt: timestamp }).where(and(eq(administratorTransfers.id, transfer.id), isNull(administratorTransfers.usedAt), isNull(administratorTransfers.cancelledAt), gt(administratorTransfers.expiresAt, timestamp))).run();
    if (claim.changes !== 1) throw new Error(unavailableMessage);

    const currentInitiator = tx.select().from(users).where(eq(users.id, transfer.initiatedByUserId)).get();
    if (!currentInitiator || currentInitiator.adminRole !== "super_admin" || currentInitiator.status !== "active") throw new Error(unavailableMessage);

    tx.insert(users).values({ id: newUserId, name, email: transfer.newEmail, avatarInitials: initials(name), status: "active", emailVerifiedAt: timestamp, locale: currentInitiator.locale, adminRole: "super_admin", createdAt: timestamp, updatedAt: timestamp }).run();
    tx.insert(credentials).values({ userId: newUserId, passwordHash, passwordChangedAt: timestamp }).run();
    tx.update(users).set({ adminRole: null, status: "suspended", updatedAt: timestamp }).where(eq(users.id, currentInitiator.id)).run();
    tx.update(sessions).set({ revokedAt: timestamp }).where(and(eq(sessions.userId, currentInitiator.id), isNull(sessions.revokedAt))).run();
    tx.update(devices).set({ revokedAt: timestamp, trusted: false }).where(and(eq(devices.userId, currentInitiator.id), isNull(devices.revokedAt))).run();
    tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: currentInitiator.id, actorLabel: currentInitiator.email, action: "admin.transfer.complete", target: newUserId, result: "success", metadataJson: JSON.stringify({ newEmail: transfer.newEmail, previousAdministratorId: currentInitiator.id }), timestamp }).run();
  });
}