import "server-only";

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db/client";
import { auditEvents } from "@/lib/db/schema";

export type AuditInput = { actorId?: string; actorLabel: string; action: string; target: string; result: "success" | "denied" | "failed"; metadata?: Record<string, string> };

export async function appendAuditEvent(input: AuditInput): Promise<void> {
  await db.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: input.actorId, actorLabel: input.actorLabel, action: input.action, target: input.target, result: input.result, metadataJson: JSON.stringify(input.metadata ?? {}), timestamp: new Date().toISOString() });
}