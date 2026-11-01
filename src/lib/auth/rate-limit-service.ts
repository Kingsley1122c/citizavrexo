import "server-only";

import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { authRateLimits } from "@/lib/db/schema";

export type AuthRateLimitScope = "login" | "register" | "password_reset" | "admin_transfer" | "admin_transfer_verify" | "admin_message" | "admin_sensitive" | "transaction_pin" | "email_delivery" | "withdrawal_authorization";

const limits: Record<AuthRateLimitScope, { attempts: number; windowMs: number }> = {
  login: { attempts: 10, windowMs: 15 * 60 * 1000 },
  register: { attempts: 5, windowMs: 60 * 60 * 1000 },
  password_reset: { attempts: 3, windowMs: 60 * 60 * 1000 },
  admin_transfer: { attempts: 3, windowMs: 60 * 60 * 1000 },
  admin_transfer_verify: { attempts: 5, windowMs: 60 * 60 * 1000 },
  admin_message: { attempts: 10, windowMs: 60 * 60 * 1000 },
  admin_sensitive: { attempts: 30, windowMs: 60 * 60 * 1000 },
  transaction_pin: { attempts: 5, windowMs: 15 * 60 * 1000 },
  email_delivery: { attempts: 90, windowMs: 24 * 60 * 60 * 1000 },
  withdrawal_authorization: { attempts: 10, windowMs: 15 * 60 * 1000 },
};

const rateLimitKey = (scope: AuthRateLimitScope, identifier: string) => `${scope}:${createHash("sha256").update(identifier.trim().toLowerCase()).digest("hex")}`;

export function consumeAuthRateLimit(scope: AuthRateLimitScope, identifier: string, nowMs = Date.now()): boolean {
  const key = rateLimitKey(scope, identifier);
  const policy = limits[scope];
  return db.transaction((tx) => {
    const current = tx.select().from(authRateLimits).where(eq(authRateLimits.key, key)).get();
    if (!current || current.resetAt <= new Date(nowMs).toISOString()) {
      tx.insert(authRateLimits).values({ key, attempts: 1, resetAt: new Date(nowMs + policy.windowMs).toISOString() }).onConflictDoUpdate({ target: authRateLimits.key, set: { attempts: 1, resetAt: new Date(nowMs + policy.windowMs).toISOString() } }).run();
      return true;
    }
    if (current.attempts >= policy.attempts) return false;
    const update = tx.update(authRateLimits).set({ attempts: current.attempts + 1 }).where(and(eq(authRateLimits.key, key), eq(authRateLimits.attempts, current.attempts))).run();
    return update.changes === 1;
  });
}

export async function clearAuthRateLimit(scope: AuthRateLimitScope, identifier: string): Promise<void> {
  await db.delete(authRateLimits).where(eq(authRateLimits.key, rateLimitKey(scope, identifier)));
}