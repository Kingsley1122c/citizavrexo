import "server-only";

import { createHash, createHmac } from "node:crypto";

export type ActionTokenPurpose = "email_verification" | "password_reset";

function secret(): string {
  const value = process.env.RECOVERY_CODE_PEPPER;
  if (!value || value.length < 32) throw new Error("Action-token signing is not configured.");
  return value;
}

export function deriveActionToken(id: string, purpose: ActionTokenPurpose): string {
  return createHmac("sha256", secret()).update(`nivora:${purpose}:${id}`).digest("base64url");
}

export function hashActionToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}