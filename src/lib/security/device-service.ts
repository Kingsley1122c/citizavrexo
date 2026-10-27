import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditEvents, devices, sessions } from "@/lib/db/schema";

export function revokeOwnedDevice(userId: string, actorLabel: string, deviceId: string): boolean {
  return db.transaction((tx) => {
    const device = tx.select().from(devices).where(and(eq(devices.id, deviceId), eq(devices.userId, userId), isNull(devices.revokedAt))).get();
    if (!device) return false;
    const now = new Date().toISOString();
    tx.update(devices).set({ revokedAt: now, trusted: false }).where(and(eq(devices.id, device.id), eq(devices.userId, userId), isNull(devices.revokedAt))).run();
    if (device.sessionId) tx.update(sessions).set({ revokedAt: now }).where(and(eq(sessions.id, device.sessionId), eq(sessions.userId, userId), isNull(sessions.revokedAt))).run();
    tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: userId, actorLabel, action: "device.revoke", target: device.id, result: "success", metadataJson: JSON.stringify({ sessionRevoked: Boolean(device.sessionId) }), timestamp: now }).run();
    return true;
  });
}