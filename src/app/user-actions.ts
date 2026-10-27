"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/authorization";
import { revokeAllSessions } from "@/lib/auth/session-service";
import { db } from "@/lib/db/client";
import { accounts, auditEvents, notifications, users } from "@/lib/db/schema";
import { rotateRecoveryCodes } from "@/lib/security/recovery-code-service";
import { revokeOwnedDevice } from "@/lib/security/device-service";
import { toggleOwnedCardCapability, toggleOwnedCardFreeze, type CardCapability, type MutableCardStatus } from "@/lib/security/card-service";
import { CardRequestError, createCardRequest } from "@/lib/cards/card-request-service";
import { SUPPORTED_CURRENCIES, type Currency } from "@/lib/currency";
import { parseMajorAmountToMinor } from "@/lib/money";
import { createTransferQuote, findCompletedTransferRetry, findTransferRecipient, getTransferReceiptForUser, TransferError, transferBetweenUsers, type TransferQuote } from "@/lib/transactions/transfer-service";
import type { BankDestination, TransferReceipt, UserProfile } from "@/lib/domain";
import { cancelOwnedWithdrawalRequest, createWithdrawalRequest, getWithdrawalSupportDetailsForUser, type WithdrawalSupportDetails, WithdrawalError } from "@/lib/withdrawals/withdrawal-service";
import { BankDestinationError, createBankDestination, deleteOwnedBankDestination } from "@/lib/withdrawals/bank-destination-service";
import { ProfileImageError, saveProfileImage } from "@/lib/users/profile-image-service";
import { ProfileError, saveUserProfile, type ProfileFieldErrors, type ProfileFieldName } from "@/lib/users/profile-service";
import { z } from "zod";
import { SUPPORTED_LOCALES } from "@/lib/i18n/config";
import { CurrencyChangeError, requestCurrencyChange } from "@/lib/accounts/currency-change-service";
import { authorizeTransferWithPin, changeTransactionPin, setUpTransactionPin, TransactionPinError } from "@/lib/security/transaction-pin-service";

export type RecoveryCodeActionState = { codes: string[]; error: string | null };
export type CardRequestActionState = { error?: string; success?: string };
export type RecipientLookupState = { error?: string; recipient?: { accountNumber: string; maskedAccountNumber: string; accountName: string; userName: string; currency: Currency } };
export type TransferQuoteActionState = { error?: string; quote?: TransferQuote };
export type MoneyActionState = { error?: string; success?: string; reference?: string; receipt?: TransferReceipt; withdrawalSupport?: WithdrawalSupportDetails };
export type BankDestinationActionState = { error?: string; success?: string; destination?: BankDestination };
export type ProfileImageActionState = { error?: string; success?: string };
type ProfileFormValues = Record<ProfileFieldName, string>;
export type ProfileActionState = { error?: string; success?: string; fieldErrors?: ProfileFieldErrors; profile?: UserProfile; values?: ProfileFormValues };
export type CurrencyChangeActionState = { error?: string; success?: string };
export type TransactionPinActionState = { error?: string; success?: string };
const opaqueId = z.string().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/);

const audit = (actorId: string, actorLabel: string, action: string, target: string) => db.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId, actorLabel, action, target, result: "success", metadataJson: "{}", timestamp: new Date().toISOString() });
const profileFailureCategory = (error: unknown) => error instanceof ProfileError ? error.message === "Enter a valid date of birth." ? "invalid_birth_date" : error.message === "The profile cannot be updated." ? "profile_unavailable" : "profile_validation" : "unexpected_error";
const withdrawalFailureCategory = (error: unknown) => {
  if (!(error instanceof WithdrawalError)) return "unexpected_error";
  if (error.message.includes("already pending")) return "pending_request_exists";
  if (error.message.includes("available balance")) return "insufficient_balance";
  if (error.message.includes("destination")) return "destination_unavailable";
  if (error.message.includes("currency")) return "currency_mismatch";
  if (error.message.includes("account")) return "account_unavailable";
  if (error.message.includes("key")) return "idempotency_conflict";
  return "withdrawal_validation";
};
const logCustomerActionFailure = (action: "profile_save" | "withdrawal_submit", category: string, error?: unknown) => console.warn("[server-action] handled failure", { action, route: "/app", responseStatus: 200, category, errorType: error instanceof Error ? error.constructor.name : "validation", deploymentId: process.env.RENDER_GIT_COMMIT ?? "unknown" });

export async function savePreferencesAction(input: unknown): Promise<void> {
  const user = await requireUser();
  const parsed = z.object({ locale: z.enum(SUPPORTED_LOCALES), displayCurrency: z.enum(SUPPORTED_CURRENCIES) }).strict().parse(input);
  await db.update(users).set({ locale: parsed.locale, displayCurrency: parsed.displayCurrency, updatedAt: new Date().toISOString() }).where(eq(users.id, user.id));
  revalidatePath("/app");
}

export async function saveProfileAction(_: ProfileActionState, formData: FormData): Promise<ProfileActionState> {
  const user = await requireUser();
  const values: ProfileFormValues = {
    legalName: String(formData.get("legalName") ?? "").trim(),
    dateOfBirth: String(formData.get("dateOfBirth") ?? "").trim(),
    residentialAddress: String(formData.get("residentialAddress") ?? "").trim(),
    city: String(formData.get("city") ?? "").trim(),
    stateProvince: String(formData.get("stateProvince") ?? "").trim(),
    country: String(formData.get("country") ?? "").trim().toUpperCase(),
    postalCode: String(formData.get("postalCode") ?? "").trim(),
    phoneNumber: String(formData.get("phoneNumber") ?? "").trim(),
  };
  let profile: UserProfile;
  try {
    profile = saveUserProfile(user.id, values);
  } catch (error) {
    logCustomerActionFailure("profile_save", profileFailureCategory(error), error);
    return { error: error instanceof ProfileError ? error.message : "The profile could not be saved.", fieldErrors: error instanceof ProfileError ? error.fieldErrors : undefined, values };
  }
  revalidatePath("/app");
  return { success: "Your profile was submitted for review.", profile };
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const user = await requireUser();
  await db.update(notifications).set({ readAt: new Date().toISOString() }).where(and(eq(notifications.id, notificationId), eq(notifications.userId, user.id)));
  revalidatePath("/app");
}

export async function markAllNotificationsRead(): Promise<void> {
  const user = await requireUser();
  await db.update(notifications).set({ readAt: new Date().toISOString() }).where(eq(notifications.userId, user.id));
  revalidatePath("/app");
}

export async function toggleCardFreeze(cardId: string): Promise<MutableCardStatus | null> {
  const user = await requireUser();
  const status = toggleOwnedCardFreeze(user.id, user.email, cardId);
  revalidatePath("/app");
  return status;
}

export async function toggleCardCapability(cardId: string, capability: CardCapability): Promise<boolean | null> {
  const user = await requireUser();
  const enabled = toggleOwnedCardCapability(user.id, user.email, cardId, capability);
  revalidatePath("/app");
  return enabled;
}

export async function revokeDevice(deviceId: string): Promise<void> {
  const user = await requireUser();
  revokeOwnedDevice(user.id, user.email, deviceId);
  revalidatePath("/app");
}

export async function logoutAllDevicesAction(): Promise<never> {
  const user = await requireUser();
  await revokeAllSessions(user.id);
  await audit(user.id, user.email, "sessions.revoke_all", user.id);
  redirect("/login");
}

export async function generateRecoveryCodesAction(): Promise<RecoveryCodeActionState> {
  const user = await requireUser();
  try {
    return { codes: await rotateRecoveryCodes(user.id, user.email), error: null };
  } catch {
    return { codes: [], error: "Recovery codes could not be generated. Please try again later." };
  }
}

export async function setUpTransactionPinAction(_: TransactionPinActionState, formData: FormData): Promise<TransactionPinActionState> {
  const user = await requireUser();
  const parsed = z.object({ pin: z.string().regex(/^\d{4}$/), confirmation: z.string().regex(/^\d{4}$/) }).safeParse({ pin: formData.get("pin"), confirmation: formData.get("confirmation") });
  if (!parsed.success) return { error: "Enter an exactly 4-digit transaction PIN." };
  try {
    await setUpTransactionPin({ userId: user.id, actorLabel: user.email, ...parsed.data });
    revalidatePath("/app");
    return { success: "Transaction PIN configured." };
  } catch (error) {
    return { error: error instanceof TransactionPinError ? error.message : "The transaction PIN could not be configured." };
  }
}

export async function changeTransactionPinAction(_: TransactionPinActionState, formData: FormData): Promise<TransactionPinActionState> {
  const user = await requireUser();
  const parsed = z.object({ currentPin: z.string().regex(/^\d{4}$/), newPin: z.string().regex(/^\d{4}$/), confirmation: z.string().regex(/^\d{4}$/) }).safeParse({ currentPin: formData.get("currentPin"), newPin: formData.get("newPin"), confirmation: formData.get("confirmation") });
  if (!parsed.success) return { error: "Enter an exactly 4-digit transaction PIN." };
  try {
    await changeTransactionPin({ userId: user.id, actorLabel: user.email, ...parsed.data });
    return { success: "Transaction PIN changed." };
  } catch (error) {
    return { error: error instanceof TransactionPinError ? error.message : "The transaction PIN could not be changed." };
  }
}

export async function requestCardAction(_: CardRequestActionState, formData: FormData): Promise<CardRequestActionState> {
  const user = await requireUser();
  const parsed = z.object({ accountId: z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/), label: z.string().trim().min(2).max(40) }).safeParse({ accountId: formData.get("accountId"), label: formData.get("label") });
  const account = parsed.success ? db.select({ currency: accounts.currency }).from(accounts).where(and(eq(accounts.id, parsed.data.accountId), eq(accounts.userId, user.id))).get() : undefined;
  const monthlyLimitMinor = account ? parseMajorAmountToMinor(formData.get("monthlyLimit"), account.currency) : null;
  if (!parsed.success || !account || monthlyLimitMinor === null) return { error: "Check the card request details and try again." };
  try {
    createCardRequest({ userId: user.id, actorLabel: user.email, accountId: parsed.data.accountId, label: parsed.data.label, monthlyLimitMinor });
  } catch (error) {
    return { error: error instanceof CardRequestError ? error.message : "The card request could not be submitted." };
  }
  revalidatePath("/app");
  return { success: "Your card request is pending approval." };
}

export async function lookupTransferRecipientAction(_: RecipientLookupState, formData: FormData): Promise<RecipientLookupState> {
  const user = await requireUser();
  const parsed = z.object({ senderAccountId: opaqueId, accountNumber: z.string().trim().regex(/^\d{10}$/) }).safeParse({ senderAccountId: formData.get("senderAccountId"), accountNumber: formData.get("accountNumber") });
  if (!parsed.success) return { error: "Enter a valid Nivora account number." };
  try {
    const recipient = findTransferRecipient(user.id, parsed.data.senderAccountId, parsed.data.accountNumber);
    return { recipient: { accountNumber: recipient.accountNumber, maskedAccountNumber: `•••• ${recipient.accountNumber.slice(-4)}`, accountName: recipient.accountName, userName: recipient.userName, currency: recipient.currency } };
  } catch (error) {
    return { error: error instanceof TransferError ? error.message : "The recipient could not be verified." };
  }
}

export async function createTransferQuoteAction(_: TransferQuoteActionState, formData: FormData): Promise<TransferQuoteActionState> {
  const user = await requireUser();
  const parsed = z.object({ senderAccountId: opaqueId, recipientAccountNumber: z.string().trim().regex(/^\d{10}$/) }).safeParse({ senderAccountId: formData.get("senderAccountId"), recipientAccountNumber: formData.get("recipientAccountNumber") });
  if (!parsed.success) return { error: "Check the transfer details and try again." };
  const sender = db.select({ currency: accounts.currency }).from(accounts).where(and(eq(accounts.id, parsed.data.senderAccountId), eq(accounts.userId, user.id))).get();
  const amountMinor = sender ? parseMajorAmountToMinor(formData.get("amount"), sender.currency) : null;
  if (!sender || amountMinor === null) return { error: "Enter a valid amount for the sending account currency." };
  try {
    return { quote: await createTransferQuote({ userId: user.id, senderAccountId: parsed.data.senderAccountId, recipientAccountNumber: parsed.data.recipientAccountNumber, amountMinor }) };
  } catch (error) {
    return { error: error instanceof TransferError ? error.message : "The exchange-rate quote could not be created." };
  }
}

export async function sendMoneyAction(_: MoneyActionState, formData: FormData): Promise<MoneyActionState> {
  const user = await requireUser();
  const parsed = z.object({ quoteId: opaqueId, idempotencyKey: opaqueId, pin: z.string().regex(/^\d{4}$/) }).safeParse({ quoteId: formData.get("quoteId"), idempotencyKey: formData.get("idempotencyKey"), pin: formData.get("pin") });
  if (!parsed.success) return { error: "This transfer confirmation is invalid. Review the transfer again." };
  try {
    const transferInput = { userId: user.id, quoteId: parsed.data.quoteId, idempotencyKey: parsed.data.idempotencyKey };
    const existingReference = findCompletedTransferRetry(transferInput);
    if (!existingReference) await authorizeTransferWithPin({ userId: user.id, quoteId: parsed.data.quoteId, pin: parsed.data.pin });
    const reference = existingReference ?? transferBetweenUsers({ ...transferInput, actorLabel: user.email });
    revalidatePath("/app");
    revalidatePath("/admin");
    return { success: "Transfer completed.", reference, receipt: getTransferReceiptForUser(reference, user.id) };
  } catch (error) {
    return { error: error instanceof TransferError || error instanceof TransactionPinError ? error.message : "The transfer could not be completed." };
  }
}

export async function requestWithdrawalAction(_: MoneyActionState, formData: FormData): Promise<MoneyActionState> {
  const user = await requireUser();
  const parsed = z.object({ accountId: opaqueId, destinationId: opaqueId, currency: z.enum(SUPPORTED_CURRENCIES), idempotencyKey: opaqueId }).safeParse({ accountId: formData.get("accountId"), destinationId: formData.get("destinationId"), currency: formData.get("currency"), idempotencyKey: formData.get("idempotencyKey") });
  const amountMinor = parsed.success ? parseMajorAmountToMinor(formData.get("amount"), parsed.data.currency) : null;
  if (!parsed.success || amountMinor === null) {
    logCustomerActionFailure("withdrawal_submit", "input_validation");
    return { error: "Check the withdrawal details and enter a valid amount." };
  }
  try {
    const reference = createWithdrawalRequest({ userId: user.id, actorLabel: user.email, amountMinor, ...parsed.data });
    revalidatePath("/app");
    revalidatePath("/admin");
    return { success: "Withdrawal Request Received", reference, withdrawalSupport: getWithdrawalSupportDetailsForUser(reference, user.id) };
  } catch (error) {
    logCustomerActionFailure("withdrawal_submit", withdrawalFailureCategory(error), error);
    return { error: error instanceof WithdrawalError ? error.message : "The withdrawal request could not be submitted." };
  }
}

export async function cancelWithdrawalAction(_: MoneyActionState, formData: FormData): Promise<MoneyActionState> {
  const user = await requireUser();
  const requestId = opaqueId.safeParse(formData.get("requestId"));
  if (!requestId.success) return { error: "The withdrawal request is invalid." };
  try {
    cancelOwnedWithdrawalRequest({ userId: user.id, actorLabel: user.email, requestId: requestId.data });
    revalidatePath("/app");
    revalidatePath("/admin");
    return { success: "Withdrawal request cancelled." };
  } catch (error) {
    return { error: error instanceof WithdrawalError ? error.message : "The withdrawal request could not be cancelled." };
  }
}

export async function createBankDestinationAction(_: BankDestinationActionState, formData: FormData): Promise<BankDestinationActionState> {
  const user = await requireUser();
  const parsed = z.object({ label: z.string().trim().min(2).max(40), bankName: z.string().trim().min(2).max(100), accountName: z.string().trim().min(2).max(100), accountNumber: z.string().trim().min(6).max(34).regex(/^[A-Za-z0-9 -]+$/), country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/), destinationType: z.literal("bank_account"), currency: z.enum(SUPPORTED_CURRENCIES) }).safeParse({ label: formData.get("label"), bankName: formData.get("bankName"), accountName: formData.get("accountName"), accountNumber: formData.get("accountNumber"), country: formData.get("country"), destinationType: formData.get("destinationType"), currency: formData.get("currency") });
  if (!parsed.success) return { error: "Check the bank account details and try again." };
  try {
    const destination = createBankDestination({ userId: user.id, actorLabel: user.email, ...parsed.data });
    revalidatePath("/app");
    return { success: "Bank destination saved.", destination };
  } catch (error) {
    return { error: error instanceof BankDestinationError ? error.message : "The bank destination could not be saved." };
  }
}

export async function deleteBankDestinationAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const destinationId = opaqueId.safeParse(formData.get("destinationId"));
  if (!destinationId.success) return;
  deleteOwnedBankDestination({ userId: user.id, actorLabel: user.email, destinationId: destinationId.data });
  revalidatePath("/app");
}

export async function uploadProfileImageAction(_: ProfileImageActionState, formData: FormData): Promise<ProfileImageActionState> {
  const user = await requireUser();
  const file = formData.get("profileImage");
  if (!(file instanceof File)) return { error: "Choose a JPEG, PNG, or WebP image." };
  try {
    await saveProfileImage({ userId: user.id, actorLabel: user.email, file });
    revalidatePath("/app");
    revalidatePath("/admin");
    return { success: "Profile photo updated." };
  } catch (error) {
    return { error: error instanceof ProfileImageError ? error.message : "The profile photo could not be saved." };
  }
}

export async function requestCurrencyChangeAction(_: CurrencyChangeActionState, formData: FormData): Promise<CurrencyChangeActionState> {
  const user = await requireUser();
  const parsed = z.object({ accountId: opaqueId, requestedCurrency: z.enum(SUPPORTED_CURRENCIES), reason: z.string().trim().max(240).optional() }).safeParse({ accountId: formData.get("accountId"), requestedCurrency: formData.get("requestedCurrency"), reason: formData.get("reason") || undefined });
  if (!parsed.success) return { error: "Check the currency-change request and try again." };
  try {
    requestCurrencyChange({ userId: user.id, actorLabel: user.email, ...parsed.data });
  } catch (error) {
    return { error: error instanceof CurrencyChangeError ? error.message : "The currency-change request could not be submitted." };
  }
  revalidatePath("/app");
  revalidatePath("/admin");
  return { success: "Currency-change request submitted." };
}