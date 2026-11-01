import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { SUPPORTED_LOCALES } from "@/lib/i18n/config";

const timestamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
};

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  avatarInitials: text("avatar_initials").notNull(),
  status: text("status", { enum: ["active", "suspended", "pending", "deleted"] }).notNull(),
  emailVerifiedAt: text("email_verified_at"),
  locale: text("locale", { enum: SUPPORTED_LOCALES }).notNull().default("en"),
  displayCurrency: text("display_currency", { enum: SUPPORTED_CURRENCIES }).notNull().default("USD"),
  adminRole: text("admin_role", { enum: ["super_admin", "administrator", "support_agent", "auditor"] }),
  profileImageKey: text("profile_image_key"),
  profileImageUpdatedAt: text("profile_image_updated_at"),
  suspensionReason: text("suspension_reason"),
  suspendedBy: text("suspended_by"),
  suspendedAt: text("suspended_at"),
  deletedAt: text("deleted_at"),
  ...timestamps,
}, (table) => [uniqueIndex("users_email_unique").on(table.email)]);

export const credentials = sqliteTable("credentials", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  transactionPinHash: text("transaction_pin_hash"),
  passwordChangedAt: text("password_changed_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: text("expires_at").notNull(),
  lastActiveAt: text("last_active_at").notNull(),
  revokedAt: text("revoked_at"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("sessions_token_hash_unique").on(table.tokenHash)]);

export const authenticationTokens = sqliteTable("authentication_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  purpose: text("purpose", { enum: ["email_verification", "password_reset", "new_device"] }).notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("authentication_tokens_hash_unique").on(table.tokenHash)]);

export const administratorTransfers = sqliteTable("administrator_transfers", {
  id: text("id").primaryKey(),
  initiatedByUserId: text("initiated_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  newEmail: text("new_email").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  cancelledAt: text("cancelled_at"),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("administrator_transfers_token_hash_unique").on(table.tokenHash)]);

export const authRateLimits = sqliteTable("auth_rate_limits", {
  key: text("key").primaryKey(),
  attempts: integer("attempts").notNull(),
  resetAt: text("reset_at").notNull(),
});

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  number: text("number").notNull(),
  type: text("type", { enum: ["personal", "savings", "business"] }).notNull(),
  currency: text("currency", { enum: SUPPORTED_CURRENCIES }).notNull(),
  balanceMinor: integer("balance_minor").notNull(),
  status: text("status", { enum: ["active", "restricted", "suspended", "closed"] }).notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("accounts_number_unique").on(table.number),
  check("accounts_number_ten_digits", sql`length(${table.number}) = 10 AND ${table.number} NOT GLOB '*[^0-9]*'`),
]);

export const bankDestinations = sqliteTable("bank_destinations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  bankName: text("bank_name").notNull(),
  accountName: text("account_name").notNull(),
  accountNumber: text("account_number").notNull(),
  country: text("country").notNull().default("NG"),
  destinationType: text("destination_type", { enum: ["bank_account"] }).notNull().default("bank_account"),
  currency: text("currency", { enum: SUPPORTED_CURRENCIES }).notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("bank_destinations_owner_account_unique").on(table.userId, table.bankName, table.accountNumber, table.currency)]);

export const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(),
  reference: text("reference").notNull(),
  idempotencyKey: text("idempotency_key"),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "restrict" }),
  type: text("type", { enum: ["credit", "debit", "transfer", "card"] }).notNull(),
  description: text("description").notNull(),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency", { enum: SUPPORTED_CURRENCIES }).notNull(),
  occurredAt: text("occurred_at").notNull(),
  status: text("status", { enum: ["pending", "completed", "failed", "reversed", "cancelled"] }).notNull(),
  balanceBeforeMinor: integer("balance_before_minor").notNull(),
  balanceAfterMinor: integer("balance_after_minor").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("transactions_reference_unique").on(table.reference), uniqueIndex("transactions_idempotency_key_unique").on(table.idempotencyKey)]);

export const adminCredits = sqliteTable("admin_credits", {
  id: text("id").primaryKey(),
  reference: text("reference").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "restrict" }),
  transactionId: text("transaction_id").notNull().references(() => transactions.id, { onDelete: "restrict" }),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency", { enum: SUPPORTED_CURRENCIES }).notNull(),
  reason: text("reason").notNull(),
  createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("admin_credits_reference_unique").on(table.reference),
  uniqueIndex("admin_credits_idempotency_key_unique").on(table.idempotencyKey),
  uniqueIndex("admin_credits_transaction_unique").on(table.transactionId),
]);

export const userStatusChanges = sqliteTable("user_status_changes", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  previousStatus: text("previous_status", { enum: ["active", "suspended"] }).notNull(),
  nextStatus: text("next_status", { enum: ["active", "suspended"] }).notNull(),
  reason: text("reason").notNull(),
  performedBy: text("performed_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  performedAt: text("performed_at").notNull(),
}, (table) => [uniqueIndex("user_status_changes_identity_unique").on(table.id)]);

export const internalTransfers = sqliteTable("internal_transfers", {
  id: text("id").primaryKey(),
  reference: text("reference").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  senderAccountId: text("sender_account_id").notNull().references(() => accounts.id, { onDelete: "restrict" }),
  recipientAccountId: text("recipient_account_id").notNull().references(() => accounts.id, { onDelete: "restrict" }),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency", { enum: SUPPORTED_CURRENCIES }).notNull(),
  recipientAmountMinor: integer("recipient_amount_minor"),
  recipientCurrency: text("recipient_currency", { enum: SUPPORTED_CURRENCIES }),
  exchangeRate: text("exchange_rate"),
  rateDate: text("rate_date"),
  rateTimestamp: text("rate_timestamp"),
  rateProvider: text("rate_provider"),
  senderName: text("sender_name"),
  senderAccountName: text("sender_account_name"),
  senderAccountNumber: text("sender_account_number"),
  recipientName: text("recipient_name"),
  recipientAccountName: text("recipient_account_name"),
  recipientAccountNumber: text("recipient_account_number"),
  status: text("status", { enum: ["completed"] }).notNull(),
  createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("internal_transfers_reference_unique").on(table.reference),
  uniqueIndex("internal_transfers_idempotency_key_unique").on(table.idempotencyKey),
]);

export const transferQuotes = sqliteTable("transfer_quotes", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  senderAccountId: text("sender_account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  recipientAccountId: text("recipient_account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  sourceAmountMinor: integer("source_amount_minor").notNull(),
  sourceCurrency: text("source_currency", { enum: SUPPORTED_CURRENCIES }).notNull(),
  recipientAmountMinor: integer("recipient_amount_minor").notNull(),
  recipientCurrency: text("recipient_currency", { enum: SUPPORTED_CURRENCIES }).notNull(),
  exchangeRate: text("exchange_rate").notNull(),
  rateDate: text("rate_date").notNull(),
  rateTimestamp: text("rate_timestamp").notNull(),
  rateProvider: text("rate_provider").notNull(),
  expiresAt: text("expires_at").notNull(),
  consumedAt: text("consumed_at"),
  createdAt: text("created_at").notNull(),
});

export const transferPinAuthorizations = sqliteTable("transfer_pin_authorizations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  quoteId: text("quote_id").notNull().references(() => transferQuotes.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  consumedAt: text("consumed_at"),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("transfer_pin_authorizations_quote_unique").on(table.quoteId)]);

export const currencyChangeRequests = sqliteTable("currency_change_requests", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "restrict" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  currentCurrency: text("current_currency", { enum: SUPPORTED_CURRENCIES }).notNull(),
  requestedCurrency: text("requested_currency", { enum: SUPPORTED_CURRENCIES }).notNull(),
  reason: text("reason"),
  status: text("status", { enum: ["pending", "approved", "rejected", "cancelled"] }).notNull(),
  requestedAt: text("requested_at").notNull(),
  reviewedBy: text("reviewed_by").references(() => users.id, { onDelete: "restrict" }),
  reviewedAt: text("reviewed_at"),
  rejectionReason: text("rejection_reason"),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("currency_change_requests_pending_account_unique").on(table.accountId).where(sql`${table.status} = 'pending'`),
]);

export const withdrawalRequests = sqliteTable("withdrawal_requests", {
  id: text("id").primaryKey(),
  reference: text("reference").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "restrict" }),
  destinationId: text("destination_id").references(() => bankDestinations.id, { onDelete: "set null" }),
  destinationBankName: text("destination_bank_name"),
  destinationAccountName: text("destination_account_name"),
  destinationAccountNumber: text("destination_account_number"),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency", { enum: SUPPORTED_CURRENCIES }).notNull(),
  status: text("status", { enum: ["pending", "completed", "rejected", "cancelled"] }).notNull(),
  authorizationStage: text("authorization_stage", { enum: ["awaiting_withdrawal_code", "awaiting_swift_code", "authorized"] }).notNull().default("awaiting_withdrawal_code"),
  pinVerifiedAt: text("pin_verified_at"),
  authorizationCompletedAt: text("authorization_completed_at"),
  submittedAt: text("submitted_at").notNull(),
  reviewedBy: text("reviewed_by").references(() => users.id, { onDelete: "restrict" }),
  reviewedAt: text("reviewed_at"),
  rejectionReason: text("rejection_reason"),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("withdrawal_requests_reference_unique").on(table.reference),
  uniqueIndex("withdrawal_requests_idempotency_key_unique").on(table.idempotencyKey),
  uniqueIndex("withdrawal_requests_pending_account_unique").on(table.accountId).where(sql`${table.status} = 'pending'`),
]);

export const withdrawalAuthorizationCodes = sqliteTable("withdrawal_authorization_codes", {
  id: text("id").primaryKey(),
  withdrawalRequestId: text("withdrawal_request_id").notNull().references(() => withdrawalRequests.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  stage: text("stage", { enum: ["withdrawal_code", "swift_code"] }).notNull(),
  codeHash: text("code_hash").notNull(),
  status: text("status", { enum: ["issued", "verified", "revoked", "expired"] }).notNull().default("issued"),
  issuedBy: text("issued_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  issuedAt: text("issued_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  verifiedAt: text("verified_at"),
  revokedAt: text("revoked_at"),
  revokedBy: text("revoked_by").references(() => users.id, { onDelete: "restrict" }),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: text("locked_until"),
  lastFailedAt: text("last_failed_at"),
  replacedByCodeId: text("replaced_by_code_id"),
}, (table) => [
  uniqueIndex("withdrawal_authorization_codes_hash_unique").on(table.codeHash),
  uniqueIndex("withdrawal_authorization_codes_stage_active_unique").on(table.withdrawalRequestId, table.stage).where(sql`${table.status} = 'issued'`),
]);

export const withdrawalAuthorizationAttempts = sqliteTable("withdrawal_authorization_attempts", {
  id: text("id").primaryKey(),
  withdrawalRequestId: text("withdrawal_request_id").notNull().references(() => withdrawalRequests.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  stage: text("stage", { enum: ["withdrawal_code", "swift_code"] }).notNull(),
  codeId: text("code_id").references(() => withdrawalAuthorizationCodes.id, { onDelete: "set null" }),
  outcome: text("outcome", { enum: ["success", "failure", "blocked", "expired", "revoked"] }).notNull(),
  reason: text("reason").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("withdrawal_authorization_attempts_code_stage_timestamp_unique").on(table.withdrawalRequestId, table.stage, table.createdAt, table.id),
]);

export const cards = sqliteTable("cards", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "restrict" }),
  label: text("label").notNull(),
  cardType: text("card_type", { enum: ["physical"] }).notNull().default("physical"),
  lastFour: text("last_four").notNull(),
  expires: text("expires").notNull(),
  status: text("status", { enum: ["active", "frozen", "expired"] }).notNull(),
  monthlyLimitMinor: integer("monthly_limit_minor").notNull(),
  monthlySpentMinor: integer("monthly_spent_minor").notNull(),
  onlinePayments: integer("online_payments", { mode: "boolean" }).notNull(),
  contactlessPayments: integer("contactless_payments", { mode: "boolean" }).notNull(),
  ...timestamps,
});

export const cardRequests = sqliteTable("card_requests", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "restrict" }),
  label: text("label").notNull(),
  cardType: text("card_type", { enum: ["physical"] }).notNull().default("physical"),
  monthlyLimitMinor: integer("monthly_limit_minor").notNull(),
  currency: text("currency", { enum: SUPPORTED_CURRENCIES }).notNull().default("USD"),
  status: text("status", { enum: ["pending", "approved", "rejected", "cancelled"] }).notNull(),
  cardId: text("card_id").references(() => cards.id, { onDelete: "restrict" }),
  rejectionReason: text("rejection_reason"),
  submittedAt: text("submitted_at").notNull(),
  reviewedBy: text("reviewed_by").references(() => users.id, { onDelete: "restrict" }),
  reviewedAt: text("reviewed_at"),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("card_requests_pending_user_unique").on(table.userId).where(sql`${table.status} = 'pending'`),
  uniqueIndex("card_requests_card_unique").on(table.cardId),
]);

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["credit", "debit", "transfer", "transaction", "security", "system"] }).notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  eventReference: text("event_reference"),
  important: integer("important", { mode: "boolean" }).notNull(),
  readAt: text("read_at"),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("notifications_user_event_reference_unique").on(table.userId, table.eventReference)]);

export const userProfiles = sqliteTable("user_profiles", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  legalName: text("legal_name"),
  dateOfBirth: text("date_of_birth"),
  residentialAddress: text("residential_address"),
  city: text("city"),
  stateProvince: text("state_province"),
  country: text("country"),
  postalCode: text("postal_code"),
  phoneNumber: text("phone_number"),
  reviewStatus: text("review_status", { enum: ["incomplete", "pending_review", "approved", "rejected"] }).notNull().default("incomplete"),
  reviewedBy: text("reviewed_by").references(() => users.id, { onDelete: "restrict" }),
  reviewedAt: text("reviewed_at"),
  rejectionReason: text("rejection_reason"),
  updatedAt: text("updated_at").notNull(),
});

export const devices = sqliteTable("devices", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sessionId: text("session_id").references(() => sessions.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  browser: text("browser").notNull(),
  location: text("location").notNull(),
  lastActiveAt: text("last_active_at").notNull(),
  loginAt: text("login_at").notNull(),
  trusted: integer("trusted", { mode: "boolean" }).notNull(),
  revokedAt: text("revoked_at"),
}, (table) => [uniqueIndex("devices_session_id_unique").on(table.sessionId)]);

export const recoveryRequests = sqliteTable("recovery_requests", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  status: text("status", { enum: ["submitted", "under_review", "additional_verification_required", "approved", "rejected", "completed"] }).notNull(),
  method: text("method", { enum: ["email", "phone", "recovery_code", "support"] }).notNull(),
  risk: text("risk", { enum: ["low", "medium", "high"] }).notNull(),
  submittedAt: text("submitted_at").notNull(),
  reviewedBy: text("reviewed_by").references(() => users.id, { onDelete: "restrict" }),
  reviewedAt: text("reviewed_at"),
});

export const recoveryCodes = sqliteTable("recovery_codes", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("recovery_codes_hash_unique").on(table.codeHash)]);

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  actorId: text("actor_id"),
  actorLabel: text("actor_label").notNull(),
  action: text("action").notNull(),
  target: text("target").notNull(),
  result: text("result", { enum: ["success", "denied", "failed"] }).notNull(),
  metadataJson: text("metadata_json").notNull(),
  timestamp: text("timestamp").notNull(),
});

export const emailOutbox = sqliteTable("email_outbox", {
  id: text("id").primaryKey(),
  recipient: text("recipient").notNull(),
  event: text("event").notNull(),
  eventReference: text("event_reference").notNull(),
  payloadJson: text("payload_json").notNull(),
  status: text("status", { enum: ["pending", "processing", "sent", "failed"] }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  lockedAt: text("locked_at"),
  nextAttemptAt: text("next_attempt_at"),
  createdAt: text("created_at").notNull(),
  sentAt: text("sent_at"),
}, (table) => [uniqueIndex("email_outbox_event_reference_unique").on(table.eventReference)]);

export const adminMessages = sqliteTable("admin_messages", {
  id: text("id").primaryKey(),
  idempotencyKey: text("idempotency_key").notNull(),
  recipientUserId: text("recipient_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  recipientName: text("recipient_name").notNull(),
  recipientEmail: text("recipient_email").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  sentBy: text("sent_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  outboxId: text("outbox_id").notNull().references(() => emailOutbox.id, { onDelete: "restrict" }),
  deliveryStatus: text("delivery_status", { enum: ["pending", "sent", "failed"] }).notNull(),
  createdAt: text("created_at").notNull(),
  deliveredAt: text("delivered_at"),
}, (table) => [
  uniqueIndex("admin_messages_idempotency_key_unique").on(table.idempotencyKey),
  uniqueIndex("admin_messages_outbox_unique").on(table.outboxId),
]);