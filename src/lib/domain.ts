export type { Currency } from "@/lib/currency";
import type { Currency } from "@/lib/currency";
import type { Locale } from "@/lib/i18n/config";
export type AccountStatus = "active" | "restricted" | "suspended" | "closed";
export type TransactionStatus =
  | "pending"
  | "completed"
  | "failed"
  | "reversed"
  | "cancelled";
export type TransactionType = "credit" | "debit" | "transfer" | "card";
export type NotificationKind =
  | "credit"
  | "debit"
  | "transfer"
  | "transaction"
  | "security"
  | "system";
export type RecoveryStatus =
  | "submitted"
  | "under_review"
  | "additional_verification_required"
  | "approved"
  | "rejected"
  | "completed";
export type AdminRole = "super_admin" | "administrator" | "support_agent" | "auditor";
export type CardRequestStatus = "pending" | "approved" | "rejected" | "cancelled";
export type WithdrawalRequestStatus = "pending" | "completed" | "rejected" | "cancelled";
export type CurrencyChangeRequestStatus = "pending" | "approved" | "rejected" | "cancelled";
export type WithdrawalAuthorizationStage = "awaiting_withdrawal_code" | "awaiting_swift_code" | "authorized";
export type WithdrawalAuthorizationCodeStage = "withdrawal_code" | "swift_code";
export type WithdrawalAuthorizationCodeStatus = "issued" | "verified" | "revoked" | "expired";

export interface User {
  id: string;
  name: string;
  email: string;
  avatarInitials: string;
  profileImageUrl?: string;
  status: "active" | "suspended" | "pending" | "deleted";
  locale: Locale;
  displayCurrency: Currency;
  suspensionReason?: string;
  suspendedBy?: string;
  suspendedAt?: string;
  emailVerified: boolean;
  createdAt: string;
  adminRole?: AdminRole | null;
}

export interface BankDestination {
  id: string;
  label: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  country: string;
  destinationType: "bank_account";
  currency: Currency;
}

export interface UserProfile {
  legalName?: string;
  dateOfBirth?: string;
  residentialAddress?: string;
  city?: string;
  stateProvince?: string;
  country?: string;
  postalCode?: string;
  phoneNumber?: string;
  completedFields: number;
  requiredFields: number;
  completionPercent: number;
  complete: boolean;
  reviewStatus: "incomplete" | "pending_review" | "approved" | "rejected";
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
}

export interface Account {
  id: string;
  userId: string;
  name: string;
  number: string;
  type: "personal" | "savings" | "business";
  currency: Currency;
  balance: number;
  status: AccountStatus;
}

export interface Transaction {
  id: string;
  reference: string;
  accountId: string;
  type: TransactionType;
  description: string;
  amount: number;
  currency: Currency;
  occurredAt: string;
  status: TransactionStatus;
  balanceBefore: number;
  balanceAfter: number;
  transferDetails?: {
    direction: "sent" | "received";
    counterpartyName: string;
    counterpartyAccountName: string;
    counterpartyAccountNumber: string;
    accountName: string;
    accountNumber: string;
    baseReference: string;
    senderName: string;
    recipientName: string;
    sourceAmount?: number;
    sourceCurrency?: Currency;
    recipientAmount?: number;
    recipientCurrency?: Currency;
    exchangeRate?: string;
    rateDate?: string;
    rateTimestamp?: string;
    rateProvider?: string;
  };
}

export interface TransactionAuthorizationRequest {
  id: string;
  reference: string;
  userId: string;
  userName: string;
  userEmail: string;
  senderAccountName: string;
  senderAccountNumber: string;
  recipientName: string;
  recipientAccountNumber: string;
  sourceAmount: number;
  sourceCurrency: Currency;
  recipientAmount: number;
  recipientCurrency: Currency;
  status: "pending" | "code_issued" | "completed" | "expired" | "cancelled";
  requestedAt: string;
  codeStatus?: "issued" | "verified" | "revoked" | "expired";
  codeIssuedAt?: string;
  codeExpiresAt?: string;
  transferReference?: string;
}

export interface CurrencyChangeRequest {
  id: string;
  accountId: string;
  userId: string;
  currentCurrency: Currency;
  requestedCurrency: Currency;
  reason?: string;
  status: CurrencyChangeRequestStatus;
  requestedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  userName?: string;
  accountNumber?: string;
}

export interface ManagedCard {
  id: string;
  accountId: string;
  label: string;
  cardType: "physical";
  lastFour: string;
  expires: string;
  status: "active" | "frozen" | "expired";
  monthlyLimit: number;
  monthlySpent: number;
  onlinePayments: boolean;
  contactlessPayments: boolean;
}

export interface Notification {
  id: string;
  kind: NotificationKind;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  important: boolean;
  eventReference?: string;
}

export interface AuthorizedDevice {
  id: string;
  name: string;
  browser: string;
  location: string;
  lastActiveAt: string;
  loginAt: string;
  current: boolean;
  trusted: boolean;
}

export interface RecoveryRequest {
  id: string;
  userId: string;
  submittedAt: string;
  status: RecoveryStatus;
  method: "email" | "phone" | "recovery_code" | "support";
  risk: "low" | "medium" | "high";
}

export interface AuditEvent {
  id: string;
  actor: string;
  action: string;
  target: string;
  timestamp: string;
  result: "success" | "denied" | "failed";
  metadata: Record<string, string>;
}

export interface AdminIdentity {
  id: string;
  name: string;
  role: AdminRole;
  permissions: string[];
}

export interface CardRequest {
  id: string;
  userId: string;
  accountId: string;
  userName?: string;
  userEmail?: string;
  accountName?: string;
  label: string;
  cardType: "physical";
  monthlyLimit: number;
  currency: Currency;
  status: CardRequestStatus;
  cardId?: string;
  rejectionReason?: string;
  submittedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface WithdrawalRequest {
  id: string;
  reference: string;
  userId: string;
  accountId: string;
  amount: number;
  currency: Currency;
  status: WithdrawalRequestStatus;
  authorizationStage: WithdrawalAuthorizationStage;
  pinVerifiedAt?: string;
  authorizationCompletedAt?: string;
  submittedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  userName?: string;
  userEmail?: string;
  userAvatarInitials?: string;
  userProfileImageUrl?: string;
  accountName?: string;
  accountNumber?: string;
  destinationId?: string;
  destinationBankName?: string;
  destinationAccountName?: string;
  destinationAccountNumber?: string;
  withdrawalCodeStatus?: WithdrawalAuthorizationCodeStatus;
  withdrawalCodeIssuedAt?: string;
  withdrawalCodeExpiresAt?: string;
  withdrawalCodeIssuedBy?: string;
  swiftCodeStatus?: WithdrawalAuthorizationCodeStatus;
  swiftCodeIssuedAt?: string;
  swiftCodeExpiresAt?: string;
  swiftCodeIssuedBy?: string;
  authorizationHistory?: WithdrawalAuthorizationHistoryEntry[];
}

export interface WithdrawalAuthorizationHistoryEntry {
  id: string;
  stage: WithdrawalAuthorizationCodeStage;
  event: "issued" | "verified" | "failed" | "blocked" | "expired" | "revoked" | "reissued";
  actorLabel: string;
  reason: string;
  createdAt: string;
}

export interface TransferReceipt {
  reference: string;
  occurredAt: string;
  amount: number;
  currency: Currency;
  sourceAmount?: number;
  sourceCurrency?: Currency;
  recipientAmount?: number;
  recipientCurrency?: Currency;
  exchangeRate?: string;
  rateDate?: string;
  rateTimestamp?: string;
  rateProvider?: string;
  status: "completed";
  senderName: string;
  senderAccountName: string;
  senderAccountNumber: string;
  recipientName: string;
  recipientAccountName: string;
  recipientAccountNumber: string;
}

export interface AdminMessage {
  id: string;
  recipientUserId: string;
  recipientName: string;
  recipientEmail: string;
  subject: string;
  deliveryStatus: "pending" | "sent" | "failed";
  createdAt: string;
  deliveredAt?: string;
}