"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { loginUser, registerUser, requestPasswordReset, resetPasswordWithToken } from "@/lib/auth/auth-service";
import { revokeCurrentSession } from "@/lib/auth/session-service";
import { clearAuthRateLimit, consumeAuthRateLimit } from "@/lib/auth/rate-limit-service";
import { SUPPORTED_LOCALES } from "@/lib/i18n/config";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";

export type AuthState = { error?: string; success?: string };
const email = z.string().trim().email().max(254);
const password = z.string().min(12).max(128);
const requestMetadata = async () => { const requestHeaders = await headers(); return { ipAddress: requestHeaders.get("x-real-ip") ?? undefined, userAgent: requestHeaders.get("user-agent") ?? undefined }; };

export async function loginAction(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z.object({ email, password, persistent: z.boolean() }).safeParse({ email: formData.get("email"), password: formData.get("password"), persistent: formData.get("persistent") === "on" });
  if (!parsed.success) return { error: "Check your details and try again." };
  if (!consumeAuthRateLimit("login", parsed.data.email)) return { error: "Too many attempts. Please try again later." };
  try { await loginUser(parsed.data, await requestMetadata()); } catch { return { error: "Invalid email or password." }; }
  await clearAuthRateLimit("login", parsed.data.email);
  redirect("/app");
}

export async function registerAction(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z.object({ name: z.string().trim().min(2).max(100).regex(/^[^\p{Cc}\p{Cf}]+$/u), email, password, locale: z.enum(SUPPORTED_LOCALES), currency: z.enum(SUPPORTED_CURRENCIES) }).safeParse({ name: formData.get("name"), email: formData.get("email"), password: formData.get("password"), locale: formData.get("locale"), currency: formData.get("currency") });
  if (!parsed.success) return { error: "Use a valid name, email, and a password of at least 12 characters." };
  if (!consumeAuthRateLimit("register", parsed.data.email)) return { error: "Too many attempts. Please try again later." };
  try { await registerUser(parsed.data, await requestMetadata()); } catch { return { error: "We couldn't create that account. Please try again." }; }
  redirect("/app");
}

export async function completePasswordResetAction(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z.object({ token: z.string().min(32).max(128), password }).safeParse({ token: formData.get("token"), password: formData.get("password") });
  if (!parsed.success) return { error: "This reset link is invalid or the password is too short." };
  if (!consumeAuthRateLimit("password_reset", parsed.data.token)) return { error: "This reset link is invalid or expired." };
  try { await resetPasswordWithToken(parsed.data.token, parsed.data.password); } catch { return { error: "This reset link is invalid or expired." }; }
  await clearAuthRateLimit("password_reset", parsed.data.token);
  return { success: "Your password has been reset. You can now sign in." };
}

export async function resetAction(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = email.safeParse(formData.get("email"));
  if (!parsed.success) return { error: "Enter a valid email address." };
  if (!consumeAuthRateLimit("password_reset", parsed.data)) return { success: "If an account matches that email, recovery instructions have been queued." };
  await requestPasswordReset(parsed.data);
  return { success: "If an account matches that email, recovery instructions have been queued." };
}

export async function logoutAction(): Promise<void> { await revokeCurrentSession(); redirect("/login"); }