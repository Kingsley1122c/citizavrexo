"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/authorization";
import { AdminCreditError, creditUserAccount } from "@/lib/admin/admin-credit-service";
import { AdminMessageError, sendAdminMessage } from "@/lib/admin/admin-message-service";
import type { AdminMessage } from "@/lib/domain";
import { changeUserStatus, UserStatusError } from "@/lib/admin/user-status-service";
import { CardRequestError, reviewCardRequest } from "@/lib/cards/card-request-service";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { parseMajorAmountToMinor } from "@/lib/money";
import { UserDeletionError, deleteUser } from "@/lib/users/user-deletion-service";
import { ProfileError, reviewUserProfile } from "@/lib/users/profile-service";
import { reviewWithdrawalRequest, WithdrawalError } from "@/lib/withdrawals/withdrawal-service";
import { CurrencyChangeError, reviewCurrencyChange } from "@/lib/accounts/currency-change-service";

export type AdminActionState = { error?: string; success?: string };
export type AdminMessageActionState = AdminActionState & { message?: AdminMessage };
const opaqueId = z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);

export async function sendAdminMessageAction(_: AdminMessageActionState, formData: FormData): Promise<AdminMessageActionState> {
  const identity = await requirePermission("notifications.manage");
  const parsed = z.object({ recipientUserId: opaqueId, subject: z.string().trim().min(2).max(120), message: z.string().trim().min(2).max(4000), idempotencyKey: z.string().min(8).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]+$/) }).safeParse({ recipientUserId: formData.get("recipientUserId"), subject: formData.get("subject"), message: formData.get("message"), idempotencyKey: formData.get("idempotencyKey") });
  if (!parsed.success) return { error: "Enter a subject and message using the allowed lengths." };
  try {
    const sent = await sendAdminMessage({ actorId: identity.id, actorLabel: identity.email, actorRole: identity.adminRole, ...parsed.data });
    revalidatePath("/admin");
    return { success: "Message sent successfully.", message: { id: sent.id, recipientUserId: sent.recipientUserId, recipientName: sent.recipientName, recipientEmail: sent.recipientEmail, subject: sent.subject, deliveryStatus: sent.deliveryStatus, createdAt: sent.createdAt, deliveredAt: sent.deliveredAt ?? undefined } };
  } catch (error) {
    return { error: error instanceof AdminMessageError ? error.message : "The message could not be sent." };
  }
}

export async function creditUserAccountAction(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const identity = await requirePermission("accounts.credit");
  const parsed = z.object({ accountId: opaqueId, currency: z.enum(SUPPORTED_CURRENCIES), reason: z.string().trim().min(3).max(200), idempotencyKey: z.string().min(8).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]+$/) }).safeParse({ accountId: formData.get("accountId"), currency: formData.get("currency"), reason: formData.get("reason"), idempotencyKey: formData.get("idempotencyKey") });
  const amountMinor = parsed.success ? parseMajorAmountToMinor(formData.get("amount"), parsed.data.currency) : null;
  if (!parsed.success || amountMinor === null) return { error: "Check the credit amount and reason." };
  try {
    const reference = creditUserAccount({ actorId: identity.id, actorLabel: identity.email, actorRole: identity.adminRole, amountMinor, ...parsed.data });
    revalidatePath("/admin");
    revalidatePath("/app");
    return { success: `Account credited. Reference ${reference}.` };
  } catch (error) {
    return { error: error instanceof AdminCreditError ? error.message : "The account could not be credited." };
  }
}

export async function changeUserStatusAction(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const identity = await requirePermission("users.suspend");
  const parsed = z.object({ userId: opaqueId, nextStatus: z.enum(["active", "suspended"]), reason: z.string().trim().max(240).optional() }).safeParse({ userId: formData.get("userId"), nextStatus: formData.get("nextStatus"), reason: formData.get("reason") || undefined });
  if (!parsed.success || (parsed.data.nextStatus === "suspended" && (!parsed.data.reason || parsed.data.reason.length < 3))) return { error: "Provide a valid reason for this status change." };
  try {
    changeUserStatus({ actorId: identity.id, actorLabel: identity.email, actorRole: identity.adminRole, ...parsed.data });
    revalidatePath("/admin");
    revalidatePath("/app");
    return { success: parsed.data.nextStatus === "suspended" ? "Customer access suspended." : "Customer access restored." };
  } catch (error) {
    return { error: error instanceof UserStatusError ? error.message : "The customer status could not be changed." };
  }
}

export async function reviewCardRequestAction(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const identity = await requirePermission("cards.review");
  const parsed = z.object({ requestId: opaqueId, decision: z.enum(["approved", "rejected"]), rejectionReason: z.string().trim().max(240).optional() }).safeParse({ requestId: formData.get("requestId"), decision: formData.get("decision"), rejectionReason: formData.get("rejectionReason") || undefined });
  if (!parsed.success) return { error: "The card review details are invalid." };
  try {
    reviewCardRequest({ actorId: identity.id, actorLabel: identity.email, actorRole: identity.adminRole, ...parsed.data });
  } catch (error) {
    return { error: error instanceof CardRequestError ? error.message : "The card request could not be reviewed." };
  }
  revalidatePath("/admin");
  revalidatePath("/app");
  return { success: `Card request ${parsed.data.decision}.` };
}

export async function deleteUserAction(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const identity = await requirePermission("users.delete");
  const parsed = z.object({ targetUserId: opaqueId, confirmation: z.literal("DELETE USER") }).safeParse({ targetUserId: formData.get("targetUserId"), confirmation: formData.get("confirmation") });
  if (!parsed.success) return { error: "Type DELETE USER to confirm deletion." };
  try {
    deleteUser({ actorId: identity.id, actorLabel: identity.email, actorRole: identity.adminRole, ...parsed.data });
  } catch (error) {
    return { error: error instanceof UserDeletionError ? error.message : "The user could not be deleted." };
  }
  revalidatePath("/admin");
  return { success: "The user was securely deleted." };
}

export async function reviewWithdrawalRequestAction(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const identity = await requirePermission("withdrawals.review");
  const parsed = z.object({ requestId: opaqueId, decision: z.enum(["completed", "rejected"]), rejectionReason: z.string().trim().max(240).optional() }).safeParse({ requestId: formData.get("requestId"), decision: formData.get("decision"), rejectionReason: formData.get("rejectionReason") || undefined });
  if (!parsed.success) return { error: "The withdrawal review details are invalid." };
  try {
    reviewWithdrawalRequest({ actorId: identity.id, actorLabel: identity.email, actorRole: identity.adminRole, ...parsed.data });
  } catch (error) {
    return { error: error instanceof WithdrawalError ? error.message : "The withdrawal request could not be reviewed." };
  }
  revalidatePath("/admin");
  revalidatePath("/app");
  return { success: `Withdrawal request ${parsed.data.decision}.` };
}

export async function reviewUserProfileAction(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const identity = await requirePermission("profiles.review");
  const parsed = z.object({ userId: opaqueId, decision: z.enum(["approved", "rejected"]), rejectionReason: z.string().trim().max(240).optional() }).safeParse({ userId: formData.get("userId"), decision: formData.get("decision"), rejectionReason: formData.get("rejectionReason") || undefined });
  if (!parsed.success) return { error: "The profile review details are invalid." };
  try {
    reviewUserProfile({ actorId: identity.id, actorLabel: identity.email, actorRole: identity.adminRole, ...parsed.data });
  } catch (error) {
    return { error: error instanceof ProfileError ? error.message : "The profile could not be reviewed." };
  }
  revalidatePath("/admin");
  revalidatePath("/app");
  return { success: `Profile ${parsed.data.decision}.` };
}

export async function reviewCurrencyChangeAction(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const identity = await requirePermission("accounts.currency.review");
  const parsed = z.object({ requestId: opaqueId, decision: z.enum(["approved", "rejected"]), rejectionReason: z.string().trim().max(240).optional() }).safeParse({ requestId: formData.get("requestId"), decision: formData.get("decision"), rejectionReason: formData.get("rejectionReason") || undefined });
  if (!parsed.success) return { error: "The currency-change review details are invalid." };
  try {
    reviewCurrencyChange({ actorId: identity.id, actorLabel: identity.email, actorRole: identity.adminRole, ...parsed.data });
  } catch (error) {
    return { error: error instanceof CurrencyChangeError ? error.message : "The currency-change request could not be reviewed." };
  }
  revalidatePath("/admin");
  revalidatePath("/app");
  return { success: `Currency-change request ${parsed.data.decision}.` };
}