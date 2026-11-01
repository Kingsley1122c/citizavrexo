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
import { issueWithdrawalAuthorizationCode, revokeWithdrawalAuthorizationCode, reviewWithdrawalRequest, WithdrawalError } from "@/lib/withdrawals/withdrawal-service";
import type { WithdrawalAuthorizationCodeStage } from "@/lib/domain";
import { CurrencyChangeError, reviewCurrencyChange } from "@/lib/accounts/currency-change-service";
import { consumeAuthRateLimit } from "@/lib/auth/rate-limit-service";
import { issueTransactionAuthorizationCode, TransactionAuthorizationError } from "@/lib/transactions/transaction-authorization-service";

export type AdminActionState = { error?: string; success?: string };
export type AdminMessageActionState = AdminActionState & { message?: AdminMessage };
export type WithdrawalAuthorizationAdminState = AdminActionState & { issuedCode?: string; expiresAt?: string; stage?: WithdrawalAuthorizationCodeStage };
export type TransactionAuthorizationAdminState = AdminActionState & { issuedCode?: string; expiresAt?: string };
const opaqueId = z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);
const enforceAdminActionLimit = (actorId: string, action: string): boolean => consumeAuthRateLimit("admin_sensitive", `${actorId}:${action}`);

export async function sendAdminMessageAction(_: AdminMessageActionState, formData: FormData): Promise<AdminMessageActionState> {
  const identity = await requirePermission("notifications.manage");
  if (!enforceAdminActionLimit(identity.id, "notifications.manage")) return { error: "Too many attempts. Please try again later." };
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
  if (!enforceAdminActionLimit(identity.id, "accounts.credit")) return { error: "Too many attempts. Please try again later." };
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
  if (!enforceAdminActionLimit(identity.id, "users.suspend")) return { error: "Too many attempts. Please try again later." };
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
  if (!enforceAdminActionLimit(identity.id, "cards.review")) return { error: "Too many attempts. Please try again later." };
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
  if (!enforceAdminActionLimit(identity.id, "users.delete")) return { error: "Too many attempts. Please try again later." };
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
  if (!enforceAdminActionLimit(identity.id, "withdrawals.review")) return { error: "Too many attempts. Please try again later." };
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

export async function issueWithdrawalAuthorizationCodeAction(_: WithdrawalAuthorizationAdminState, formData: FormData): Promise<WithdrawalAuthorizationAdminState> {
  const identity = await requirePermission("withdrawals.review");
  if (!enforceAdminActionLimit(identity.id, "withdrawals.issue_code")) return { error: "Too many attempts. Please try again later." };
  const parsed = z.object({ requestId: opaqueId, stage: z.enum(["withdrawal_code", "swift_code"]), mode: z.enum(["issue", "reissue"]).default("issue") }).safeParse({ requestId: formData.get("requestId"), stage: formData.get("stage"), mode: formData.get("mode") || "issue" });
  if (!parsed.success) return { error: "The authorization issue details are invalid." };
  try {
    const issued = await issueWithdrawalAuthorizationCode({ actorId: identity.id, actorLabel: identity.email, actorRole: identity.adminRole, ...parsed.data });
    revalidatePath("/admin");
    revalidatePath("/app");
    return {
      success: `${parsed.data.stage === "withdrawal_code" ? "Withdrawal" : "SWIFT authorization"} code issued successfully.`,
      issuedCode: issued.code,
      expiresAt: issued.expiresAt,
      stage: issued.stage,
    };
  } catch (error) {
    return { error: error instanceof WithdrawalError ? error.message : "The authorization code could not be issued." };
  }
}

export async function revokeWithdrawalAuthorizationCodeAction(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const identity = await requirePermission("withdrawals.review");
  if (!enforceAdminActionLimit(identity.id, "withdrawals.revoke_code")) return { error: "Too many attempts. Please try again later." };
  const parsed = z.object({ requestId: opaqueId, stage: z.enum(["withdrawal_code", "swift_code"]), reason: z.string().trim().max(240).optional() }).safeParse({ requestId: formData.get("requestId"), stage: formData.get("stage"), reason: formData.get("reason") || undefined });
  if (!parsed.success) return { error: "The authorization revoke details are invalid." };
  try {
    revokeWithdrawalAuthorizationCode({ actorId: identity.id, actorLabel: identity.email, actorRole: identity.adminRole, ...parsed.data });
    revalidatePath("/admin");
    revalidatePath("/app");
    return { success: `${parsed.data.stage === "withdrawal_code" ? "Withdrawal" : "SWIFT authorization"} code revoked.` };
  } catch (error) {
    return { error: error instanceof WithdrawalError ? error.message : "The authorization code could not be revoked." };
  }
}

export async function reviewUserProfileAction(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const identity = await requirePermission("profiles.review");
  if (!enforceAdminActionLimit(identity.id, "profiles.review")) return { error: "Too many attempts. Please try again later." };
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
  if (!enforceAdminActionLimit(identity.id, "accounts.currency.review")) return { error: "Too many attempts. Please try again later." };
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

export async function issueTransactionAuthorizationCodeAction(_: TransactionAuthorizationAdminState, formData: FormData): Promise<TransactionAuthorizationAdminState> {
  const identity = await requirePermission("transactions.authorize");
  if (!enforceAdminActionLimit(identity.id, "transactions.authorize")) return { error: "Too many attempts. Please try again later." };
  const parsed = z.object({ requestId: opaqueId, mode: z.enum(["issue", "reissue"]).default("issue") }).safeParse({ requestId: formData.get("requestId"), mode: formData.get("mode") || "issue" });
  if (!parsed.success) return { error: "The transaction authorization request is invalid." };
  try {
    const issued = issueTransactionAuthorizationCode({ actorId: identity.id, actorLabel: identity.email, actorRole: identity.adminRole, ...parsed.data });
    revalidatePath("/admin");
    revalidatePath("/app");
    return { success: "Transaction authorization code issued and queued for email delivery.", issuedCode: issued.code, expiresAt: issued.expiresAt };
  } catch (error) {
    return { error: error instanceof TransactionAuthorizationError ? error.message : "The transaction authorization code could not be issued." };
  }
}