import "server-only";

import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import type { Account, AuditEvent, AuthorizedDevice, BankDestination, CardRequest, CurrencyChangeRequest, ManagedCard, Notification, RecoveryRequest, Transaction, TransactionAuthorizationRequest, User, UserProfile, WithdrawalRequest } from "@/lib/domain";
import type { AdminRole } from "@/lib/domain";
import { hasPermission } from "@/lib/auth/permissions";
import { getCustomerServiceContact, type CustomerServiceContact } from "@/lib/customer-service";
import { db } from "@/lib/db/client";
import { accounts, adminMessages, auditEvents, bankDestinations, cardRequests, cards, credentials, currencyChangeRequests, devices, internalTransfers, notifications, recoveryRequests, transactionAuthorizationCodes, transactionAuthorizationRequests, transactions, users, userProfiles, withdrawalAuthorizationAttempts, withdrawalAuthorizationCodes, withdrawalRequests } from "@/lib/db/schema";
import { getUserProfile, profileSummary } from "@/lib/users/profile-service";
import { minorToMajor } from "@/lib/money";

const mapAuthorizationOutcome = (outcome: "success" | "failure" | "blocked" | "expired" | "revoked") => {
  if (outcome === "success") return "verified" as const;
  if (outcome === "failure") return "failed" as const;
  return outcome;
};

export type UserWorkspace = { user: User; profile: UserProfile; transactionPinConfigured: boolean; accounts: Account[]; transactions: Transaction[]; cards: ManagedCard[]; cardRequests: CardRequest[]; bankDestinations: BankDestination[]; withdrawalRequests: WithdrawalRequest[]; currencyChangeRequests: CurrencyChangeRequest[]; notifications: Notification[]; devices: AuthorizedDevice[]; recoveryRequests: RecoveryRequest[]; auditEvents: AuditEvent[]; customerService: CustomerServiceContact };

export async function getUserWorkspace(userId: string, currentSessionId?: string): Promise<UserWorkspace | null> {
  const [userRow] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!userRow) return null;
  const credential = await db.select({ transactionPinHash: credentials.transactionPinHash }).from(credentials).where(eq(credentials.userId, userId)).get();
  const accountRows = await db.select().from(accounts).where(eq(accounts.userId, userId));
  const ownedAccountById = new Map(accountRows.map((account) => [account.id, account]));
  const accountIds = accountRows.map((account) => account.id);
  const transactionRows = accountIds.length ? await db.select().from(transactions).where(inArray(transactions.accountId, accountIds)).orderBy(desc(transactions.occurredAt)) : [];
  const transferRows = accountIds.length ? await db.select().from(internalTransfers).where(or(inArray(internalTransfers.senderAccountId, accountIds), inArray(internalTransfers.recipientAccountId, accountIds))) : [];
  const participantIds = [...new Set(transferRows.flatMap((transfer) => [transfer.senderAccountId, transfer.recipientAccountId]))];
  const participantAccounts = participantIds.length ? await db.select().from(accounts).where(inArray(accounts.id, participantIds)) : [];
  const participantUsers = participantAccounts.length ? await db.select().from(users).where(inArray(users.id, [...new Set(participantAccounts.map((account) => account.userId))])) : [];
  const accountById = new Map(participantAccounts.map((account) => [account.id, account]));
  const userById = new Map(participantUsers.map((user) => [user.id, user]));
  const transferByTransactionReference = new Map<string, (typeof transferRows)[number]>(transferRows.flatMap((transfer) => [[`${transfer.reference}-D`, transfer], [`${transfer.reference}-C`, transfer]]));
  const cardRows = accountIds.length ? await db.select().from(cards).where(inArray(cards.accountId, accountIds)) : [];
  const cardRequestRows = await db.select().from(cardRequests).where(eq(cardRequests.userId, userId)).orderBy(desc(cardRequests.submittedAt));
  const withdrawalRows = await db.select().from(withdrawalRequests).where(eq(withdrawalRequests.userId, userId)).orderBy(desc(withdrawalRequests.submittedAt));
  const withdrawalIds = withdrawalRows.map((row) => row.id);
  const withdrawalCodeRows = withdrawalIds.length ? await db.select().from(withdrawalAuthorizationCodes).where(inArray(withdrawalAuthorizationCodes.withdrawalRequestId, withdrawalIds)).orderBy(desc(withdrawalAuthorizationCodes.issuedAt)) : [];
  const withdrawalAttemptRows = withdrawalIds.length ? await db.select().from(withdrawalAuthorizationAttempts).where(inArray(withdrawalAuthorizationAttempts.withdrawalRequestId, withdrawalIds)).orderBy(desc(withdrawalAuthorizationAttempts.createdAt)) : [];
  const currencyChangeRows = await db.select().from(currencyChangeRequests).where(eq(currencyChangeRequests.userId, userId)).orderBy(desc(currencyChangeRequests.requestedAt));
  const destinationRows = await db.select().from(bankDestinations).where(eq(bankDestinations.userId, userId)).orderBy(desc(bankDestinations.updatedAt));
  const notificationRows = await db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt));
  const deviceRows = await db.select().from(devices).where(and(eq(devices.userId, userId), isNull(devices.revokedAt))).orderBy(desc(devices.lastActiveAt));

  return {
    user: { id: userRow.id, name: userRow.name, email: userRow.email, avatarInitials: userRow.avatarInitials, profileImageUrl: userRow.profileImageKey && userRow.profileImageUpdatedAt ? `/profile-image/${userRow.id}?v=${encodeURIComponent(userRow.profileImageUpdatedAt)}` : undefined, status: userRow.status, locale: userRow.locale, displayCurrency: userRow.displayCurrency, suspensionReason: userRow.suspensionReason ?? undefined, suspendedBy: userRow.suspendedBy ?? undefined, suspendedAt: userRow.suspendedAt ?? undefined, emailVerified: Boolean(userRow.emailVerifiedAt), createdAt: userRow.createdAt, adminRole: userRow.adminRole },
    profile: getUserProfile(userId),
    transactionPinConfigured: Boolean(credential?.transactionPinHash),
    accounts: accountRows.map((row) => ({ ...row, balance: minorToMajor(row.balanceMinor, row.currency) })),
    transactions: transactionRows.map((row) => {
      const transfer = transferByTransactionReference.get(row.reference);
      const direction = transfer?.senderAccountId === row.accountId ? "sent" : "received";
      const counterparty = transfer ? accountById.get(direction === "sent" ? transfer.recipientAccountId : transfer.senderAccountId) : undefined;
      const counterpartyUser = counterparty ? userById.get(counterparty.userId) : undefined;
      const ownAccount = accountById.get(row.accountId);
      const recipientCurrency = transfer?.recipientCurrency ?? transfer?.currency;
      const recipientAmountMinor = transfer?.recipientAmountMinor ?? transfer?.amountMinor;
      const counterpartyName = direction === "sent" ? transfer?.recipientName ?? counterpartyUser?.name : transfer?.senderName ?? counterpartyUser?.name;
      const counterpartyAccountName = direction === "sent" ? transfer?.recipientAccountName ?? counterparty?.name : transfer?.senderAccountName ?? counterparty?.name;
      const counterpartyAccountNumber = direction === "sent" ? transfer?.recipientAccountNumber ?? counterparty?.number : transfer?.senderAccountNumber ?? counterparty?.number;
      const accountName = direction === "sent" ? transfer?.senderAccountName ?? ownAccount?.name : transfer?.recipientAccountName ?? ownAccount?.name;
      const accountNumber = direction === "sent" ? transfer?.senderAccountNumber ?? ownAccount?.number : transfer?.recipientAccountNumber ?? ownAccount?.number;
      const senderName = transfer?.senderName ?? (direction === "sent" ? userRow.name : counterpartyUser?.name);
      const recipientName = transfer?.recipientName ?? (direction === "received" ? userRow.name : counterpartyUser?.name);
      return { ...row, amount: minorToMajor(row.amountMinor, row.currency), balanceBefore: minorToMajor(row.balanceBeforeMinor, row.currency), balanceAfter: minorToMajor(row.balanceAfterMinor, row.currency), transferDetails: transfer && counterpartyName && counterpartyAccountName && counterpartyAccountNumber && accountName && accountNumber && senderName && recipientName && recipientCurrency && recipientAmountMinor !== undefined ? { direction, counterpartyName, counterpartyAccountName, counterpartyAccountNumber, accountName, accountNumber, baseReference: transfer.reference, senderName, recipientName, sourceAmount: minorToMajor(transfer.amountMinor, transfer.currency), sourceCurrency: transfer.currency, recipientAmount: minorToMajor(recipientAmountMinor, recipientCurrency), recipientCurrency, exchangeRate: transfer.exchangeRate ?? "1", rateDate: transfer.rateDate ?? transfer.createdAt.slice(0, 10), rateTimestamp: transfer.rateTimestamp ?? transfer.createdAt, rateProvider: transfer.rateProvider ?? "same_currency" } : undefined };
    }),
    cards: cardRows.map((row) => ({ ...row, monthlyLimit: minorToMajor(row.monthlyLimitMinor, ownedAccountById.get(row.accountId)?.currency ?? "USD"), monthlySpent: minorToMajor(row.monthlySpentMinor, ownedAccountById.get(row.accountId)?.currency ?? "USD") })),
    cardRequests: cardRequestRows.map((row) => ({ ...row, monthlyLimit: minorToMajor(row.monthlyLimitMinor, row.currency), cardId: row.cardId ?? undefined, rejectionReason: row.rejectionReason ?? undefined, reviewedBy: row.reviewedBy ?? undefined, reviewedAt: row.reviewedAt ?? undefined })),
    bankDestinations: destinationRows.map(({ id, label, bankName, accountName, accountNumber, country, destinationType, currency }) => ({ id, label, bankName, accountName, accountNumber, country, destinationType, currency })),
    withdrawalRequests: withdrawalRows.map((row) => {
      const byStage = new Map(withdrawalCodeRows.filter((code) => code.withdrawalRequestId === row.id).map((code) => [code.stage, code]));
      return {
        ...row,
        destinationId: row.destinationId ?? undefined,
        destinationBankName: row.destinationBankName ?? undefined,
        destinationAccountName: row.destinationAccountName ?? undefined,
        destinationAccountNumber: row.destinationAccountNumber ?? undefined,
        amount: minorToMajor(row.amountMinor, row.currency),
        rejectionReason: row.rejectionReason ?? undefined,
        reviewedBy: row.reviewedBy ?? undefined,
        reviewedAt: row.reviewedAt ?? undefined,
        authorizationStage: row.authorizationStage,
        pinVerifiedAt: row.pinVerifiedAt ?? undefined,
        authorizationCompletedAt: row.authorizationCompletedAt ?? undefined,
        withdrawalCodeStatus: byStage.get("withdrawal_code")?.status,
        withdrawalCodeIssuedAt: byStage.get("withdrawal_code")?.issuedAt ?? undefined,
        withdrawalCodeExpiresAt: byStage.get("withdrawal_code")?.expiresAt ?? undefined,
        swiftCodeStatus: byStage.get("swift_code")?.status,
        swiftCodeIssuedAt: byStage.get("swift_code")?.issuedAt ?? undefined,
        swiftCodeExpiresAt: byStage.get("swift_code")?.expiresAt ?? undefined,
        authorizationHistory: withdrawalAttemptRows
          .filter((attempt) => attempt.withdrawalRequestId === row.id)
          .map((attempt) => ({
            id: attempt.id,
            stage: attempt.stage,
            event: mapAuthorizationOutcome(attempt.outcome),
            actorLabel: "customer",
            reason: attempt.reason,
            createdAt: attempt.createdAt,
          })),
      };
    }),
    currencyChangeRequests: currencyChangeRows.map((row) => ({ ...row, reason: row.reason ?? undefined, reviewedBy: row.reviewedBy ?? undefined, reviewedAt: row.reviewedAt ?? undefined, rejectionReason: row.rejectionReason ?? undefined })),
    notifications: notificationRows.map((row) => ({ id: row.id, kind: row.kind, title: row.title, message: row.message, createdAt: row.createdAt, read: Boolean(row.readAt), important: row.important, eventReference: row.eventReference ?? undefined })),
    devices: deviceRows.map((row) => ({ id: row.id, name: row.name, browser: row.browser, location: row.location, lastActiveAt: row.lastActiveAt, loginAt: row.loginAt, current: row.sessionId === currentSessionId, trusted: row.trusted })),
    recoveryRequests: [],
    auditEvents: [],
    customerService: getCustomerServiceContact(),
  };
}

export async function getAdminWorkspace(role: AdminRole) {
  const userRows = hasPermission(role, "users.read") ? await db.select().from(users).where(isNull(users.deletedAt)).orderBy(desc(users.createdAt)) : [];
  const accountRows = hasPermission(role, "accounts.read") ? await db.select().from(accounts).orderBy(desc(accounts.createdAt)) : [];
  const adminAccountById = new Map(accountRows.map((account) => [account.id, account]));
  const transactionRows = hasPermission(role, "transactions.read") ? await db.select().from(transactions).orderBy(desc(transactions.occurredAt)) : [];
  const notificationRows = hasPermission(role, "notifications.manage") ? await db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(100) : [];
  const messageRows = hasPermission(role, "notifications.manage") ? await db.select().from(adminMessages).orderBy(desc(adminMessages.createdAt)).limit(200) : [];
  const recoveryRows = hasPermission(role, "recovery.read") ? await db.select().from(recoveryRequests).orderBy(desc(recoveryRequests.submittedAt)).limit(50) : [];
  const auditRows = hasPermission(role, "audit.read") ? await db.select().from(auditEvents).orderBy(desc(auditEvents.timestamp)).limit(100) : [];
  const accountIds = accountRows.map((account) => account.id);
  const cardRows = accountIds.length ? await db.select().from(cards).where(inArray(cards.accountId, accountIds)) : [];
  const cardRequestRows = hasPermission(role, "cards.review") ? await db.select({ request: cardRequests, userName: users.name, userEmail: users.email, accountName: accounts.name }).from(cardRequests).innerJoin(users, eq(cardRequests.userId, users.id)).innerJoin(accounts, eq(cardRequests.accountId, accounts.id)).where(isNull(users.deletedAt)).orderBy(desc(cardRequests.submittedAt)) : [];
  const profileRows = hasPermission(role, "profiles.review") ? await db.select({ profile: userProfiles, userName: users.name, userEmail: users.email }).from(userProfiles).innerJoin(users, eq(userProfiles.userId, users.id)).where(and(isNull(users.deletedAt), isNull(users.adminRole))).orderBy(desc(userProfiles.updatedAt)) : [];
  const withdrawalRows = hasPermission(role, "withdrawals.review") ? await db.select({ request: withdrawalRequests, userName: users.name, userEmail: users.email, userAvatarInitials: users.avatarInitials, userProfileImageKey: users.profileImageKey, userProfileImageUpdatedAt: users.profileImageUpdatedAt, accountName: accounts.name, accountNumber: accounts.number }).from(withdrawalRequests).innerJoin(users, eq(withdrawalRequests.userId, users.id)).innerJoin(accounts, eq(withdrawalRequests.accountId, accounts.id)).where(isNull(users.deletedAt)).orderBy(desc(withdrawalRequests.submittedAt)) : [];
  const withdrawalRequestIds = withdrawalRows.map(({ request }) => request.id);
  const authorizationCodeRows = withdrawalRequestIds.length ? await db.select({
    code: withdrawalAuthorizationCodes,
    issuedByName: users.name,
  }).from(withdrawalAuthorizationCodes).leftJoin(users, eq(withdrawalAuthorizationCodes.issuedBy, users.id)).where(inArray(withdrawalAuthorizationCodes.withdrawalRequestId, withdrawalRequestIds)).orderBy(desc(withdrawalAuthorizationCodes.issuedAt)) : [];
  const authorizationAttemptRows = withdrawalRequestIds.length ? await db.select().from(withdrawalAuthorizationAttempts).where(inArray(withdrawalAuthorizationAttempts.withdrawalRequestId, withdrawalRequestIds)).orderBy(desc(withdrawalAuthorizationAttempts.createdAt)) : [];
  const currencyChangeRows = hasPermission(role, "accounts.currency.review") ? await db.select({ request: currencyChangeRequests, userName: users.name, accountNumber: accounts.number }).from(currencyChangeRequests).innerJoin(users, eq(currencyChangeRequests.userId, users.id)).innerJoin(accounts, eq(currencyChangeRequests.accountId, accounts.id)).where(isNull(users.deletedAt)).orderBy(desc(currencyChangeRequests.requestedAt)) : [];
  const transactionAuthorizationRows = hasPermission(role, "transactions.authorize") ? await db.select().from(transactionAuthorizationRequests).orderBy(desc(transactionAuthorizationRequests.requestedAt)) : [];
  const transactionAuthorizationIds = transactionAuthorizationRows.map((request) => request.id);
  const transactionAuthorizationCodeRows = transactionAuthorizationIds.length ? await db.select().from(transactionAuthorizationCodes).where(inArray(transactionAuthorizationCodes.requestId, transactionAuthorizationIds)).orderBy(desc(transactionAuthorizationCodes.issuedAt)) : [];
  const adminUserById = new Map(userRows.map((user) => [user.id, user]));
  return {
    users: userRows.map((row) => ({ id: row.id, name: row.name, email: row.email, avatarInitials: row.avatarInitials, profileImageUrl: row.profileImageKey && row.profileImageUpdatedAt ? `/profile-image/${row.id}?v=${encodeURIComponent(row.profileImageUpdatedAt)}` : undefined, status: row.status, locale: row.locale, displayCurrency: row.displayCurrency, suspensionReason: row.suspensionReason ?? undefined, suspendedBy: row.suspendedBy ?? undefined, suspendedAt: row.suspendedAt ?? undefined, emailVerified: Boolean(row.emailVerifiedAt), createdAt: row.createdAt, adminRole: row.adminRole })),
    accounts: accountRows.map((row) => ({ ...row, balance: minorToMajor(row.balanceMinor, row.currency) })),
    transactions: transactionRows.map((row) => ({ ...row, amount: minorToMajor(row.amountMinor, row.currency), balanceBefore: minorToMajor(row.balanceBeforeMinor, row.currency), balanceAfter: minorToMajor(row.balanceAfterMinor, row.currency) })),
    transactionAuthorizationRequests: transactionAuthorizationRows.map((request): TransactionAuthorizationRequest => {
      const customer = adminUserById.get(request.userId);
      const sender = adminAccountById.get(request.senderAccountId);
      const recipient = adminAccountById.get(request.recipientAccountId);
      const recipientUser = recipient ? adminUserById.get(recipient.userId) : undefined;
      const latestCode = transactionAuthorizationCodeRows.find((code) => code.requestId === request.id);
      return { id: request.id, reference: request.reference, userId: request.userId, userName: customer?.name ?? "Unavailable customer", userEmail: customer?.email ?? "Unavailable", senderAccountName: sender?.name ?? "Unavailable account", senderAccountNumber: sender?.number ?? "", recipientName: recipientUser?.name ?? "Unavailable recipient", recipientAccountNumber: recipient?.number ?? "", sourceAmount: minorToMajor(request.sourceAmountMinor, request.sourceCurrency), sourceCurrency: request.sourceCurrency, recipientAmount: minorToMajor(request.recipientAmountMinor, request.recipientCurrency), recipientCurrency: request.recipientCurrency, status: request.status, requestedAt: request.requestedAt, codeStatus: latestCode?.status, codeIssuedAt: latestCode?.issuedAt, codeExpiresAt: latestCode?.expiresAt, transferReference: request.transferReference ?? undefined };
    }),
    cards: cardRows.map((row) => ({ ...row, monthlyLimit: minorToMajor(row.monthlyLimitMinor, adminAccountById.get(row.accountId)?.currency ?? "USD"), monthlySpent: minorToMajor(row.monthlySpentMinor, adminAccountById.get(row.accountId)?.currency ?? "USD") })),
    cardRequests: cardRequestRows.map(({ request, userName, userEmail, accountName }) => ({ ...request, userName, userEmail, accountName, monthlyLimit: minorToMajor(request.monthlyLimitMinor, request.currency), cardId: request.cardId ?? undefined, rejectionReason: request.rejectionReason ?? undefined, reviewedBy: request.reviewedBy ?? undefined, reviewedAt: request.reviewedAt ?? undefined })),
    profiles: profileRows.map(({ profile, userName, userEmail }) => ({ ...profileSummary(profile), userId: profile.userId, userName, userEmail, updatedAt: profile.updatedAt })),
    withdrawalRequests: withdrawalRows.map(({ request, userName, userEmail, userAvatarInitials, userProfileImageKey, userProfileImageUpdatedAt, accountName, accountNumber }) => {
      const latestByStage = new Map(
        authorizationCodeRows
          .filter(({ code }) => code.withdrawalRequestId === request.id)
          .map(({ code, issuedByName }) => [code.stage, { ...code, issuedByName: issuedByName ?? undefined }]),
      );
      return {
        ...request,
        userName,
        userEmail,
        userAvatarInitials,
        userProfileImageUrl: userProfileImageKey && userProfileImageUpdatedAt ? `/profile-image/${request.userId}?v=${encodeURIComponent(userProfileImageUpdatedAt)}` : undefined,
        accountName,
        accountNumber,
        destinationId: request.destinationId ?? undefined,
        destinationBankName: request.destinationBankName ?? undefined,
        destinationAccountName: request.destinationAccountName ?? undefined,
        destinationAccountNumber: request.destinationAccountNumber ?? undefined,
        amount: minorToMajor(request.amountMinor, request.currency),
        rejectionReason: request.rejectionReason ?? undefined,
        reviewedBy: request.reviewedBy ?? undefined,
        reviewedAt: request.reviewedAt ?? undefined,
        authorizationStage: request.authorizationStage,
        pinVerifiedAt: request.pinVerifiedAt ?? undefined,
        authorizationCompletedAt: request.authorizationCompletedAt ?? undefined,
        withdrawalCodeStatus: latestByStage.get("withdrawal_code")?.status,
        withdrawalCodeIssuedAt: latestByStage.get("withdrawal_code")?.issuedAt,
        withdrawalCodeExpiresAt: latestByStage.get("withdrawal_code")?.expiresAt,
        withdrawalCodeIssuedBy: latestByStage.get("withdrawal_code")?.issuedByName,
        swiftCodeStatus: latestByStage.get("swift_code")?.status,
        swiftCodeIssuedAt: latestByStage.get("swift_code")?.issuedAt,
        swiftCodeExpiresAt: latestByStage.get("swift_code")?.expiresAt,
        swiftCodeIssuedBy: latestByStage.get("swift_code")?.issuedByName,
        authorizationHistory: authorizationAttemptRows
          .filter((attempt) => attempt.withdrawalRequestId === request.id)
          .map((attempt) => ({
            id: attempt.id,
            stage: attempt.stage,
            event: mapAuthorizationOutcome(attempt.outcome),
            actorLabel: "customer",
            reason: attempt.reason,
            createdAt: attempt.createdAt,
          })),
      };
    }),
    currencyChangeRequests: currencyChangeRows.map(({ request, userName, accountNumber }) => ({ ...request, userName, accountNumber, reason: request.reason ?? undefined, reviewedBy: request.reviewedBy ?? undefined, reviewedAt: request.reviewedAt ?? undefined, rejectionReason: request.rejectionReason ?? undefined })),
    notifications: notificationRows.map((row) => ({ id: row.id, userId: row.userId, kind: row.kind, title: row.title, message: row.message, createdAt: row.createdAt, read: Boolean(row.readAt), important: row.important, eventReference: row.eventReference ?? undefined })),
    adminMessages: messageRows.map((row) => ({ id: row.id, recipientUserId: row.recipientUserId, recipientName: row.recipientName, recipientEmail: row.recipientEmail, subject: row.subject, deliveryStatus: row.deliveryStatus, createdAt: row.createdAt, deliveredAt: row.deliveredAt ?? undefined })),
    recoveryRequests: recoveryRows.map((row) => ({ id: row.id, userId: row.userId, submittedAt: row.submittedAt, status: row.status, method: row.method, risk: row.risk })),
    auditEvents: auditRows.map((row) => ({ id: row.id, actor: row.actorLabel, action: row.action, target: row.target, timestamp: row.timestamp, result: row.result, metadata: JSON.parse(row.metadataJson) as Record<string, string> })),
  };
}