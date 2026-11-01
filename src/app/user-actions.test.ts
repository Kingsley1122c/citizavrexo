import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
const withdrawalRequestRow = {
  id: "withdrawal-request-action-test",
  authorizationStage: "awaiting_withdrawal_code",
};
vi.mock("@/lib/db/client", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          get: vi.fn(() => withdrawalRequestRow),
        })),
      })),
    })),
  },
}));
vi.mock("@/lib/auth/authorization", () => ({
  requireUser: vi.fn(async () => ({
    id: "action-user",
    email: "action-user@example.test",
    status: "active",
  })),
}));
vi.mock("@/lib/users/profile-service", () => {
  class ProfileError extends Error {
    constructor(message: string, readonly fieldErrors = {}) { super(message); }
  }
  return { ProfileError, saveUserProfile: vi.fn(() => ({ complete: true, reviewStatus: "pending_review", completedFields: 8, requiredFields: 8, completionPercent: 100 })) };
});
vi.mock("@/lib/withdrawals/bank-destination-service", () => {
  class BankDestinationError extends Error {}
  return {
    BankDestinationError,
    createBankDestination: vi.fn(() => ({ id: "action-destination", label: "Primary bank", bankName: "Test Bank", accountName: "Action User", accountNumber: "123456789", country: "US", destinationType: "bank_account", currency: "USD" })),
    deleteOwnedBankDestination: vi.fn(),
  };
});
vi.mock("@/lib/withdrawals/withdrawal-service", () => {
  class WithdrawalError extends Error {}
  return {
    WithdrawalError,
    cancelOwnedWithdrawalRequest: vi.fn(),
    requestWithdrawalWithPin: vi.fn(() => "NVW-action-test"),
    verifyWithdrawalAuthorizationCode: vi.fn(),
    getWithdrawalSupportDetailsForUser: vi.fn(() => ({
      reference: "NVW-action-test",
      amountMinor: 2550,
      currency: "USD",
      bankName: "Test Bank",
      accountName: "Action User",
      maskedAccountNumber: "****6789",
    })),
  };
});
vi.mock("@/lib/security/transaction-pin-service", () => {
  class TransactionPinError extends Error {}
  return { TransactionPinError, authorizeTransferWithPin: vi.fn(async () => "pin-auth-test"), changeTransactionPin: vi.fn(), setUpTransactionPin: vi.fn() };
});
vi.mock("@/lib/transactions/transfer-service", () => {
  class TransferError extends Error {}
  return { TransferError, createTransferQuote: vi.fn(), findCompletedTransferRetry: vi.fn(), findTransferRecipient: vi.fn(), getTransferReceiptForUser: vi.fn(() => ({ reference: "NVT-action-test" })), transferBetweenUsers: vi.fn(() => "NVT-action-test") };
});
vi.mock("@/lib/transactions/transaction-authorization-service", () => {
  class TransactionAuthorizationError extends Error {}
  return { TransactionAuthorizationError, requestTransactionAuthorization: vi.fn(() => ({ requestId: "transaction-authorization-action-test", reference: "NVA-action-test", status: "pending" })), verifyTransactionAuthorizationCode: vi.fn() };
});

import { revalidatePath } from "next/cache";
import { createBankDestinationAction, requestWithdrawalAction, saveProfileAction, sendMoneyAction } from "./user-actions";
import { ProfileError, saveUserProfile } from "@/lib/users/profile-service";
import { createBankDestination } from "@/lib/withdrawals/bank-destination-service";
import {
  requestWithdrawalWithPin,
  getWithdrawalSupportDetailsForUser,
  WithdrawalError,
} from "@/lib/withdrawals/withdrawal-service";
import { authorizeTransferWithPin } from "@/lib/security/transaction-pin-service";
import { requestTransactionAuthorization } from "@/lib/transactions/transaction-authorization-service";

describe("customer mutation actions", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("submits profile completion for the authenticated user", async () => {
    const formData = new FormData();
    formData.set("legalName", "Action User");
    formData.set("dateOfBirth", "1990-01-01");
    formData.set("residentialAddress", "10 Test Street");
    formData.set("city", "Lagos");
    formData.set("stateProvince", "Lagos");
    formData.set("country", "NG");
    formData.set("postalCode", "100001");
    formData.set("phoneNumber", "+2348000000000");

    await expect(saveProfileAction({}, formData)).resolves.toEqual({
      success: "Your profile was submitted for review.",
      profile: { complete: true, reviewStatus: "pending_review", completedFields: 8, requiredFields: 8, completionPercent: 100 },
    });
    expect(saveUserProfile).toHaveBeenCalledWith("action-user", {
      legalName: "Action User",
      dateOfBirth: "1990-01-01",
      residentialAddress: "10 Test Street",
      city: "Lagos",
      stateProvince: "Lagos",
      country: "NG",
      postalCode: "100001",
      phoneNumber: "+2348000000000",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/app");
  });

  it("returns the newly persisted bank destination for immediate selection", async () => {
    const formData = new FormData();
    formData.set("label", "Primary bank");
    formData.set("bankName", "Test Bank");
    formData.set("accountName", "Action User");
    formData.set("accountNumber", "123456789");
    formData.set("country", "US");
    formData.set("destinationType", "bank_account");
    formData.set("currency", "USD");

    await expect(createBankDestinationAction({}, formData)).resolves.toMatchObject({
      success: "Bank destination saved.",
      destination: { id: "action-destination", currency: "USD" },
    });
    expect(createBankDestination).toHaveBeenCalledWith(expect.objectContaining({ userId: "action-user", currency: "USD" }));
    expect(revalidatePath).toHaveBeenCalledWith("/app");
  });

  it("submits an idempotent withdrawal for the authenticated user", async () => {
    const formData = new FormData();
    formData.set("accountId", "action-account");
    formData.set("destinationId", "action-destination");
    formData.set("amount", "25.50");
    formData.set("currency", "USD");
    formData.set("idempotencyKey", "withdrawal-ui-action-test");
    formData.set("pin", "2468");

    await expect(requestWithdrawalAction({}, formData)).resolves.toMatchObject({
      success: "Withdrawal Request Received",
      reference: "NVW-action-test",
      withdrawalRequestId: "withdrawal-request-action-test",
      authorizationStage: "awaiting_withdrawal_code",
      authorizationCompleted: false,
      withdrawalSupport: {
        reference: "NVW-action-test",
        amountMinor: 2550,
        currency: "USD",
        bankName: "Test Bank",
        accountName: "Action User",
        maskedAccountNumber: "****6789",
      },
    });
    expect(requestWithdrawalWithPin).toHaveBeenCalledWith({
      userId: "action-user",
      actorLabel: "action-user@example.test",
      accountId: "action-account",
      destinationId: "action-destination",
      amountMinor: 2550,
      currency: "USD",
      idempotencyKey: "withdrawal-ui-action-test",
      pin: "2468",
    });
    expect(getWithdrawalSupportDetailsForUser).toHaveBeenCalledWith(
      "NVW-action-test",
      "action-user",
    );
    expect(revalidatePath).toHaveBeenCalledWith("/app");
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
  });

  it("verifies the PIN for the exact quote before requesting a transaction code without forwarding plaintext", async () => {
    const formData = new FormData();
    formData.set("quoteId", "quote-action-test");
    formData.set("idempotencyKey", "transfer-ui-action-test");
    formData.set("pin", "2468");

    await expect(sendMoneyAction({}, formData)).resolves.toMatchObject({ success: "Transaction authorization requested.", transactionAuthorizationRequestId: "transaction-authorization-action-test", transactionAuthorizationReference: "NVA-action-test" });
    expect(authorizeTransferWithPin).toHaveBeenCalledWith({ userId: "action-user", quoteId: "quote-action-test", pin: "2468" });
    expect(requestTransactionAuthorization).toHaveBeenCalledWith({ userId: "action-user", actorLabel: "action-user@example.test", quoteId: "quote-action-test", pinAuthorizationId: "pin-auth-test", idempotencyKey: "transfer-ui-action-test" });
    expect(JSON.stringify(vi.mocked(requestTransactionAuthorization).mock.calls)).not.toContain("2468");
  });

  it("logs a redacted profile validation category without form values", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.mocked(saveUserProfile).mockImplementationOnce(() => { throw new ProfileError("Correct the highlighted profile fields and try again.", { phoneNumber: "Enter a phone number in international format, for example +14155552671." }); });

    const result = await saveProfileAction({}, new FormData());

    expect(result).toMatchObject({ error: "Correct the highlighted profile fields and try again.", fieldErrors: { phoneNumber: "Enter a phone number in international format, for example +14155552671." }, values: { phoneNumber: "" } });
    expect(warning).toHaveBeenCalledWith("[server-action] handled failure", expect.objectContaining({ action: "profile_save", responseStatus: 200, category: "profile_validation", errorType: "ProfileError" }));
    expect(JSON.stringify(warning.mock.calls)).not.toContain("phoneNumber");
  });

  it("reports and logs an existing pending withdrawal without exposing request data", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.mocked(requestWithdrawalWithPin).mockImplementationOnce(() => { throw new WithdrawalError("A withdrawal request is already pending for this account."); });
    const formData = new FormData();
    formData.set("accountId", "action-account");
    formData.set("destinationId", "action-destination");
    formData.set("amount", "1.00");
    formData.set("currency", "USD");
    formData.set("idempotencyKey", "withdrawal-ui-pending-test");
    formData.set("pin", "2468");

    const result = await requestWithdrawalAction({}, formData);

    expect(result).toEqual({ error: "A withdrawal request is already pending for this account." });
    expect(warning).toHaveBeenCalledWith("[server-action] handled failure", expect.objectContaining({ action: "withdrawal_submit", responseStatus: 200, category: "pending_request_exists", errorType: "WithdrawalError" }));
    expect(JSON.stringify(warning.mock.calls)).not.toContain("action-destination");
  });
});