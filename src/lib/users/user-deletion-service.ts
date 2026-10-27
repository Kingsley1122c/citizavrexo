import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { hasPermission } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { authenticationTokens, auditEvents, bankDestinations, cardRequests, credentials, currencyChangeRequests, devices, emailOutbox, notifications, recoveryCodes, sessions, users, userProfiles, withdrawalRequests } from "@/lib/db/schema";
import type { AdminRole } from "@/lib/domain";
import { deleteProfileImageFileSync } from "@/lib/users/profile-image-service";

export class UserDeletionError extends Error {}

export function deleteUser(input: { actorId: string; actorLabel: string; actorRole: AdminRole | null; targetUserId: string; confirmation: string }): void {
  if (!hasPermission(input.actorRole, "users.delete")) throw new UserDeletionError("User deletion is not permitted.");
  if (input.confirmation !== "DELETE USER") throw new UserDeletionError("Type DELETE USER to confirm deletion.");
  if (input.actorId === input.targetUserId) throw new UserDeletionError("You cannot delete your own account.");
  const now = new Date().toISOString();
  const profileImageKey = db.transaction((tx) => {
    const target = tx.select().from(users).where(eq(users.id, input.targetUserId)).get();
    if (!target || target.status === "deleted") throw new UserDeletionError("The user is not available for deletion.");
    if (target.adminRole === "super_admin") {
      const remaining = tx.select({ id: users.id }).from(users).where(and(eq(users.adminRole, "super_admin"), eq(users.status, "active"))).all();
      if (remaining.length <= 1) throw new UserDeletionError("The last super administrator cannot be deleted.");
    }
    if (target.adminRole) throw new UserDeletionError("Administrator accounts must be managed through the existing administrator policy.");
    const anonymizedEmail = `deleted+${createHash("sha256").update(target.id).digest("hex").slice(0, 24)}@deleted.invalid`;
    tx.update(sessions).set({ revokedAt: now }).where(and(eq(sessions.userId, target.id), isNull(sessions.revokedAt))).run();
    tx.update(devices).set({ revokedAt: now, trusted: false }).where(and(eq(devices.userId, target.id), isNull(devices.revokedAt))).run();
    tx.delete(authenticationTokens).where(eq(authenticationTokens.userId, target.id)).run();
    tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, target.id)).run();
    tx.delete(credentials).where(eq(credentials.userId, target.id)).run();
    tx.delete(notifications).where(eq(notifications.userId, target.id)).run();
    tx.delete(bankDestinations).where(eq(bankDestinations.userId, target.id)).run();
    tx.delete(userProfiles).where(eq(userProfiles.userId, target.id)).run();
    tx.update(cardRequests).set({ status: "cancelled", updatedAt: now }).where(and(eq(cardRequests.userId, target.id), eq(cardRequests.status, "pending"))).run();
    tx.update(withdrawalRequests).set({ status: "cancelled", updatedAt: now }).where(and(eq(withdrawalRequests.userId, target.id), eq(withdrawalRequests.status, "pending"))).run();
    tx.update(currencyChangeRequests).set({ status: "cancelled", updatedAt: now }).where(and(eq(currencyChangeRequests.userId, target.id), eq(currencyChangeRequests.status, "pending"))).run();
    tx.update(emailOutbox).set({ recipient: anonymizedEmail, payloadJson: JSON.stringify({ redacted: true }), status: "failed", attempts: 5, lastError: "Recipient account deleted.", lockedAt: null, nextAttemptAt: null }).where(eq(emailOutbox.recipient, target.email)).run();
    const update = tx.update(users).set({ name: "Deleted user", email: anonymizedEmail, avatarInitials: "DU", profileImageKey: null, profileImageUpdatedAt: null, status: "deleted", emailVerifiedAt: null, adminRole: null, deletedAt: now, updatedAt: now }).where(and(eq(users.id, target.id), eq(users.status, target.status))).run();
    if (update.changes !== 1) throw new UserDeletionError("The user changed while deletion was in progress.");
    tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: input.actorId, actorLabel: input.actorLabel, action: "user.delete", target: target.id, result: "success", metadataJson: JSON.stringify({ strategy: "anonymized_tombstone", sessionsRevoked: true, credentialsRemoved: true }), timestamp: now }).run();
    return target.profileImageKey;
  });
  deleteProfileImageFileSync(profileImageKey);
}