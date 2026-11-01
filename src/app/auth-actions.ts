"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { loginUser, registerUser, requestEmailVerification, requestPasswordReset, resetPasswordWithToken } from "@/lib/auth/auth-service";
import { revokeCurrentSession } from "@/lib/auth/session-service";
import { clearAuthRateLimit, consumeAuthRateLimit } from "@/lib/auth/rate-limit-service";
import { SUPPORTED_LOCALES } from "@/lib/i18n/config";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { isTransactionalEmailConfigured } from "@/lib/notifications/resend-transport";
import { passwordSchema } from "@/lib/auth/password-policy";

export type AuthState = { error?: string; success?: string };
const email = z.string().trim().email().max(254);
const requestMetadata = async () => { const requestHeaders = await headers(); return { ipAddress: requestHeaders.get("x-real-ip") ?? undefined, userAgent: requestHeaders.get("user-agent") ?? undefined }; };

export async function loginAction(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z.object({ email, password: passwordSchema, persistent: z.boolean() }).safeParse({ email: formData.get("email"), password: formData.get("password"), persistent: formData.get("persistent") === "on" });
  if (!parsed.success) return { error: "Check your details and try again." };
  if (!consumeAuthRateLimit("login", parsed.data.email)) return { error: "Too many attempts. Please try again later." };
  try { await loginUser(parsed.data, await requestMetadata()); } catch { return { error: "Invalid email or password." }; }
  await clearAuthRateLimit("login", parsed.data.email);
  redirect("/app");
}

export async function registerAction(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z.object({ name: z.string().trim().min(2).max(100).regex(/^[^\p{Cc}\p{Cf}]+$/u), email, password: passwordSchema, pin: z.string().regex(/^\d{4}$/), confirmation: z.string().regex(/^\d{4}$/), locale: z.enum(SUPPORTED_LOCALES), currency: z.enum(SUPPORTED_CURRENCIES) }).safeParse({ name: formData.get("name"), email: formData.get("email"), password: formData.get("password"), pin: formData.get("pin"), confirmation: formData.get("confirmation"), locale: formData.get("locale"), currency: formData.get("currency") });
  if (!parsed.success) return { error: "Use a valid name, email, password, and exactly 4-digit transaction PIN." };
  if (parsed.data.pin !== parsed.data.confirmation) return { error: "Transaction PINs do not match." };
  if (!isTransactionalEmailConfigured()) return { error: "Registration cannot currently be completed because email verification delivery is unavailable. No account was created." };
  if (!consumeAuthRateLimit("register", parsed.data.email)) return { error: "Too many attempts. Please try again later." };
  try { await registerUser({ name: parsed.data.name, email: parsed.data.email, password: parsed.data.password, pin: parsed.data.pin, locale: parsed.data.locale, currency: parsed.data.currency }, await requestMetadata()); } catch { return { error: "We couldn't confirm verification delivery. If your account is pending, request a new verification link." }; }
  return { success: "Verification email accepted for delivery. Check your inbox to continue." };
}

export async function resendVerificationAction(formData: FormData): Promise<void> {
  const parsed = email.safeParse(formData.get("email"));
  if (!parsed.success) redirect("/verify-email?resend=invalid");
  if (!isTransactionalEmailConfigured()) redirect("/verify-email?resend=unavailable");
  const metadata = await requestMetadata();
  const emailAllowed = consumeAuthRateLimit("email_verification", `email:${parsed.data}`);
  const addressAllowed = consumeAuthRateLimit("email_verification", `ip:${metadata.ipAddress ?? "unknown"}`);
  if (emailAllowed && addressAllowed) {
    try { await requestEmailVerification(parsed.data); } catch {}
  }
  redirect("/verify-email?resend=requested");
}

export async function completePasswordResetAction(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z.object({ token: z.string().min(32).max(128), password: passwordSchema }).safeParse({ token: formData.get("token"), password: formData.get("password") });
  if (!parsed.success) return { error: "This reset link is invalid or the password is too short." };
  if (!consumeAuthRateLimit("password_reset", parsed.data.token)) return { error: "This reset link is invalid or expired." };
  try { await resetPasswordWithToken(parsed.data.token, parsed.data.password); } catch { return { error: "This reset link is invalid or expired." }; }
  await clearAuthRateLimit("password_reset", parsed.data.token);
  return { success: "Your password has been reset. You can now sign in." };
}

export async function resetAction(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = email.safeParse(formData.get("email"));
  if (!parsed.success) return { error: "Enter a valid email address." };
  if (!isTransactionalEmailConfigured()) return { error: "Email delivery is unavailable. No recovery email was sent." };
  if (!consumeAuthRateLimit("password_reset", parsed.data)) return { success: "If an account matches that email, recovery instructions will be sent." };
  await requestPasswordReset(parsed.data);
  return { success: "If an account matches that email, recovery instructions will be sent." };
}

export async function logoutAction(): Promise<void> { await revokeCurrentSession(); redirect("/login"); }