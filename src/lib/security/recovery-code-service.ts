import "server-only";

import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditEvents, recoveryCodes } from "@/lib/db/schema";
import { requireRecoveryCodePepper } from "@/lib/security/runtime-secrets";

const digest = (code: string) => createHmac("sha256", requireRecoveryCodePepper()).update(code).digest("hex");

export async function rotateRecoveryCodes(userId: string, actorLabel: string, count = 10): Promise<string[]> {
  if (!Number.isInteger(count) || count < 1 || count > 20) throw new Error("Recovery code count must be between 1 and 20.");
  const plainText = Array.from({ length: count }, () => `${randomBytes(8).toString("hex").toUpperCase()}-${randomBytes(8).toString("hex").toUpperCase()}`);
  const now = new Date().toISOString();
  db.transaction((tx) => {
    tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId)).run();
    tx.insert(recoveryCodes).values(plainText.map((code) => ({ id: randomUUID(), userId, codeHash: digest(code), createdAt: now }))).run();
    tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: userId, actorLabel, action: "recovery_codes.rotate", target: userId, result: "success", metadataJson: JSON.stringify({ count }), timestamp: now }).run();
  });
  return plainText;
}

export async function consumeRecoveryCode(userId: string, candidate: string): Promise<boolean> {
  const rows = await db.select().from(recoveryCodes).where(and(eq(recoveryCodes.userId, userId), isNull(recoveryCodes.usedAt)));
  const candidateDigest = Buffer.from(digest(candidate));
  const match = rows.find((row) => { const stored = Buffer.from(row.codeHash); return stored.length === candidateDigest.length && timingSafeEqual(stored, candidateDigest); });
  if (!match) return false;
  const result = await db.update(recoveryCodes).set({ usedAt: new Date().toISOString() }).where(and(eq(recoveryCodes.id, match.id), isNull(recoveryCodes.usedAt)));
  return result.changes === 1;
}