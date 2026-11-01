import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { hasPermission } from "@/lib/auth/permissions";
import type { AdminRole } from "@/lib/domain";
import { db } from "@/lib/db/client";
import { auditEvents, devices, sessions, users, userStatusChanges } from "@/lib/db/schema";
import { persistUserEvent } from "@/lib/notifications/user-event-service";
import { userUi } from "@/lib/i18n/user-ui";

export class UserStatusError extends Error {}

export function changeUserStatus(input: { actorId: string; actorLabel: string; actorRole: AdminRole | null; userId: string; nextStatus: "active" | "suspended"; reason?: string }): void {
  if (!hasPermission(input.actorRole, "users.suspend")) throw new UserStatusError("User status management is not permitted.");
  const reason = input.reason?.trim() ?? "";
  if (input.nextStatus === "suspended" && (reason.length < 3 || reason.length > 240 || /[\p{Cc}\p{Cf}]/u.test(reason))) throw new UserStatusError("A valid suspension reason is required.");
  if (input.userId === input.actorId) throw new UserStatusError("Administrators cannot change their own status.");

  db.transaction((tx) => {
    const actor = tx.select().from(users).where(and(eq(users.id, input.actorId), eq(users.status, "active"), isNull(users.deletedAt))).get();
    const target = tx.select().from(users).where(and(eq(users.id, input.userId), isNull(users.deletedAt))).get();
    if (!actor || actor.adminRole !== input.actorRole || !hasPermission(actor.adminRole, "users.suspend")) throw new UserStatusError("User status management is not permitted.");
    if (!target || target.adminRole || !["active", "suspended"].includes(target.status)) throw new UserStatusError("The selected customer cannot be updated.");
    if (target.status === input.nextStatus) throw new UserStatusError(`The user is already ${input.nextStatus}.`);

    const now = new Date().toISOString();
    const reference = `NUS-${randomUUID()}`;
    const actionReason = input.nextStatus === "suspended" ? reason : (reason || "Account access restored by an administrator.");
    const update = tx.update(users).set({ status: input.nextStatus, suspensionReason: input.nextStatus === "suspended" ? actionReason : null, suspendedBy: input.nextStatus === "suspended" ? actor.id : null, suspendedAt: input.nextStatus === "suspended" ? now : null, updatedAt: now }).where(and(eq(users.id, target.id), eq(users.status, target.status))).run();
    if (update.changes !== 1) throw new UserStatusError("The user status changed. Refresh and retry.");
    if (input.nextStatus === "suspended") {
      tx.update(sessions).set({ revokedAt: now }).where(and(eq(sessions.userId, target.id), isNull(sessions.revokedAt))).run();
      tx.update(devices).set({ revokedAt: now, trusted: false }).where(and(eq(devices.userId, target.id), isNull(devices.revokedAt))).run();
    }
    tx.insert(userStatusChanges).values({ id: reference, userId: target.id, previousStatus: target.status as "active" | "suspended", nextStatus: input.nextStatus, reason: actionReason, performedBy: actor.id, performedAt: now }).run();
    const t = userUi(target.locale);
    const localizedTitle = input.nextStatus === "suspended" ? t.notifications.titleAccountSuspended : t.notifications.titleAccountRestored;
    persistUserEvent(tx, { userId: target.id, email: target.email, displayName: target.name, locale: target.locale, kind: "security", title: input.nextStatus === "suspended" ? "Account suspended" : "Account restored", message: input.nextStatus === "suspended" ? "Your account access has been suspended. Contact Customer Service if you need assistance." : "Your CITIZAVREXO account access has been restored.", emailEvent: "important_account_notification", eventKey: reference, emailEventKey: `${reference}:${input.nextStatus}`, publicReference: reference, emailSummary: localizedTitle, important: true, createdAt: now });
    tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: actor.id, actorLabel: actor.email, action: `user.${input.nextStatus === "suspended" ? "suspend" : "unsuspend"}`, target: target.id, result: "success", metadataJson: JSON.stringify({ reason: actionReason, reference }), timestamp: now }).run();
  }, { behavior: "immediate" });
}
