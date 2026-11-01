import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/lib/db/client";
import { devices, sessions, users } from "@/lib/db/schema";
import type { AdminRole } from "@/lib/domain";

const COOKIE_NAME = "Citizavrexo_session";
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export type AuthenticatedUser = { id: string; name: string; email: string; status: "active" | "suspended" | "pending" | "deleted"; adminRole: AdminRole | null; sessionId: string };

export async function createSession(userId: string, persistent: boolean, request?: { ipAddress?: string; userAgent?: string }): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const sessionId = randomUUID();
  const now = new Date();
  const expires = new Date(now.getTime() + (persistent ? 30 : 1) * 24 * 60 * 60 * 1000);
  db.transaction((tx) => {
    tx.insert(sessions).values({ id: sessionId, userId, tokenHash: hashToken(token), expiresAt: expires.toISOString(), lastActiveAt: now.toISOString(), createdAt: now.toISOString(), ipAddress: request?.ipAddress, userAgent: request?.userAgent }).run();
    tx.insert(devices).values({ id: randomUUID(), userId, sessionId, name: request?.userAgent?.includes("Mobile") ? "Mobile device" : "Desktop device", browser: request?.userAgent?.slice(0, 120) || "Unknown browser", location: request?.ipAddress || "Unknown location", lastActiveAt: now.toISOString(), loginAt: now.toISOString(), trusted: false }).run();
  });
  const store = await cookies();
  store.set(COOKIE_NAME, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires });
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const now = new Date().toISOString();
  const [row] = await db.select({ id: users.id, name: users.name, email: users.email, status: users.status, adminRole: users.adminRole, sessionId: sessions.id }).from(sessions).innerJoin(users, eq(sessions.userId, users.id)).where(and(eq(sessions.tokenHash, hashToken(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, now))).limit(1);
  return row ?? null;
}

export async function revokeCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) await db.update(sessions).set({ revokedAt: new Date().toISOString() }).where(eq(sessions.tokenHash, hashToken(token)));
  store.delete(COOKIE_NAME);
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await db.update(sessions).set({ revokedAt: new Date().toISOString() }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  (await cookies()).delete(COOKIE_NAME);
}
