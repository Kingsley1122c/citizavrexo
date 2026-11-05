"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { loginUser, registerUser, requestEmailVerification, requestPasswordReset, resetPasswordWithToken, verifyRegisteredEmail } from "@/lib/auth/auth-service";
import { revokeCurrentSession } from "@/lib/auth/session-service";
import { clearAuthRateLimit, consumeAuthRateLimit } from "@/lib/auth/rate-limit-service";
import { SUPPORTED_LOCALES } from "@/lib/i18n/config";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { isTransactionalEmailConfigured } from "@/lib/notifications/resend-transport";
import { passwordSchema } from "@/lib/auth/password-policy";
import { usernameSchema } from "@/lib/auth/username-policy";

export type AuthState = { error?: string; success?: string };
const email = z.string().trim().email().max(254);
const requestMetadata = async () => { const requestHeaders = await headers(); return { ipAddress: requestHeaders.get("x-real-ip") ?? undefined, userAgent: requestHeaders.get("user-agent") ?? undefined }; };

export async function loginAction(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z.object({ email: z.string().trim().min(3).max(254), password: passwordSchema, persistent: z.boolean() }).safeParse({ email: formData.get("email"), password: formData.get("password"), persistent: formData.get("persistent") === "on" });
  if (!parsed.success) return { error: "Check your details and try again." };
  if (!consumeAuthRateLimit("login", parsed.data.email)) return { error: "Too many attempts. Please try again later." };
  try { await loginUser(parsed.data, await requestMetadata()); } catch { return { error: "Invalid email, username, or password." }; }
  await clearAuthRateLimit("login", parsed.data.email);
  redirect("/app");
}

export async function registerAction(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z.object({ name: z.string().trim().min(2).max(100).regex(/^[^\p{Cc}\p{Cf}]+$/u), username: usernameSchema, email, password: passwordSchema, passwordConfirmation: passwordSchema, pin: z.string().regex(/^\d{4}$/), pinConfirmation: z.string().regex(/^\d{4}$/), locale: z.enum(SUPPORTED_LOCALES), currency: z.enum(SUPPORTED_CURRENCIES) }).safeParse({ name: formData.get("name"), username: formData.get("username"), email: formData.get("email"), password: formData.get("password"), passwordConfirmation: formData.get("passwordConfirmation"), pin: formData.get("pin"), pinConfirmation: formData.get("pinConfirmation"), locale: formData.get("locale"), currency: formData.get("currency") });
  if (!parsed.success) return { error: "Use a valid name, username, email, password, and exactly 4-digit transaction PIN." };
  if (parsed.data.password !== parsed.data.passwordConfirmation) return { error: "Passwords do not match." };
  if (parsed.data.pin !== parsed.data.pinConfirmation) return { error: "Transaction PINs do not match." };
  if (!consumeAuthRateLimit("register", parsed.data.email)) return { error: "Too many attempts. Please try again later." };
  try { await registerUser({ name: parsed.data.name, username: parsed.data.username, email: parsed.data.email, password: parsed.data.password, pin: parsed.data.pin, locale: parsed.data.locale, currency: parsed.data.currency }, await requestMetadata()); } catch { return { error: "We couldn't create your account. Check your details and try again." }; }
  redirect("/app");
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

export async function verifyEmailAction(formData: FormData): Promise<void> {
  const parsed = z.object({
    token: z.string().min(32).max(128),
    email: z.string().trim().email().max(254),
  }).safeParse({ token: formData.get("token"), email: formData.get("email") });
  if (!parsed.success) redirect("/verify-email?verified=invalid");
  try {
    verifyRegisteredEmail(parsed.data.token, parsed.data.email);
  } catch {
    redirect("/verify-email?verified=invalid");
  }
  redirect("/verify-email?verified=success");
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