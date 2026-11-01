import "server-only";

import { createHash, createHmac } from "node:crypto";
import { requireRecoveryCodePepper } from "@/lib/security/runtime-secrets";

export type ActionTokenPurpose = "email_verification" | "password_reset";

export function deriveActionToken(id: string, purpose: ActionTokenPurpose): string {
  return createHmac("sha256", requireRecoveryCodePepper()).update(`Citizavrexo:${purpose}:${id}`).digest("base64url");
}

export function hashActionToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
