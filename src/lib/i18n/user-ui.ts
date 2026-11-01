import type { Notification, NotificationKind, TransactionType } from "@/lib/domain";
import type { Locale } from "@/lib/i18n/config";
import { getUserUiCatalog } from "@/lib/i18n/locales/user-ui";

export function userUi(locale: Locale) {
  return getUserUiCatalog(locale);
}

const TRANSFER_TO_PREFIX = "Transfer to ";
const TRANSFER_FROM_PREFIX = "Transfer from ";

export function localizeAccountName(locale: Locale, name: string): string {
  const { accountTypes } = userUi(locale).app;
  const map: Record<string, string> = {
    "Personal Account": accountTypes.personal,
    "Dollar Account": accountTypes.personal,
    "Savings Account": accountTypes.savings,
    "Business Account": accountTypes.business,
  };
  return map[name] ?? name;
}

export function localizeTransactionDescription(locale: Locale, description: string): string {
  const { transactionDescriptions } = userUi(locale).app;
  const map: Record<string, string> = {
    "Salary Credit": transactionDescriptions.salaryCredit,
    "Transfer": transactionDescriptions.transfer,
    "Investment Return": transactionDescriptions.investmentReturn,
    "Card Payment": transactionDescriptions.cardPayment,
    "Administrative account credit": transactionDescriptions.administrativeAccountCredit,
  };
  if (map[description]) return map[description];
  if (description.startsWith(TRANSFER_TO_PREFIX)) {
    return transactionDescriptions.transferTo.replace("{name}", description.slice(TRANSFER_TO_PREFIX.length));
  }
  if (description.startsWith(TRANSFER_FROM_PREFIX)) {
    return transactionDescriptions.transferFrom.replace("{name}", description.slice(TRANSFER_FROM_PREFIX.length));
  }
  return description;
}

export function localizeTransactionType(locale: Locale, type: TransactionType): string {
  const t = userUi(locale);
  const map: Record<TransactionType, string> = {
    credit: t.notifications.titleAccountCredited,
    debit: t.notifications.titleAccountDebited,
    transfer: t.app.transactionDescriptions.transfer,
    card: t.app.nav.cards,
  };
  return map[type] ?? type;
}

export function localizeAuthStateMessage(locale: Locale, message?: string): string | undefined {
  if (!message) return undefined;
  const t = userUi(locale);
  const map: Record<string, string> = {
    "Check your details and try again.": t.messages.genericAuthError,
    "Too many attempts. Please try again later.": t.messages.tooManyAttempts,
    "Invalid email or password.": t.messages.genericAuthError,
    "Use a valid name, email, password, and exactly 4-digit transaction PIN.": t.auth.registerSubtitle,
    "Transaction PINs do not match.": t.messages.genericAuthError,
    "Use a valid name, email, and a password of at least 12 characters.": t.auth.registerSubtitle,
    "Registration cannot currently be completed because email verification delivery is unavailable. No account was created.": t.auth.registrationUnavailable,
    "We couldn't create that account. Please try again.": t.messages.genericAuthError,
    "Verification email accepted for delivery. Check your inbox to continue.": t.auth.resetSubtitle,
    "This reset link is invalid or the password is too short.": t.auth.resetSubtitle,
    "This reset link is invalid or expired.": t.auth.resetSubtitle,
    "Your password has been reset. You can now sign in.": t.resetPassword.passwordReset,
    "Enter a valid email address.": t.auth.emailAddress,
    "If an account matches that email, recovery instructions have been queued.": t.auth.resetSubtitle,
  };
  return map[message] ?? t.messages.genericAuthError;
}

export function localizeUserActionMessage(locale: Locale, message?: string): string | undefined {
  if (!message) return undefined;
  const t = userUi(locale);
  const safeDomainMessages = new Set([
    "Complete every required profile field with valid information.",
    "Enter a valid date of birth.",
    "The profile cannot be updated.",
    "A valid withdrawal key is required.",
    "Enter a valid amount greater than zero.",
    "This withdrawal key was already used for different details.",
    "The selected account is not available.",
    "The selected account must be active.",
    "The selected account currency changed.",
    "The selected bank destination is not available.",
    "The bank destination uses a different currency.",
    "The requested amount exceeds the available balance.",
    "A withdrawal request is already pending for this account.",
    "The withdrawal support details are unavailable.",
    "Enter an exactly 4-digit transaction PIN.",
    "Transaction PINs do not match.",
    "Transaction PIN setup is not available.",
    "Set up a transaction PIN first.",
    "Set up a transaction PIN in Security before sending money.",
    "Set up a transaction PIN in Security before requesting withdrawals.",
    "The current transaction PIN is incorrect.",
    "The transaction PIN is incorrect.",
    "Too many incorrect PIN attempts. Try again later.",
    "Transaction PIN authorization is invalid or expired. Enter your PIN again.",
  ]);
  const map: Record<string, string> = {
    "The profile could not be saved.": t.messages.profileSaveFailed,
    "Your card eligibility profile is complete.": t.messages.profileSaved,
    "Your profile was submitted for review.": t.profileCompletion.submittedMessage,
    "Recovery codes could not be generated. Please try again later.": t.messages.recoveryCodesFailed,
    "Check the card request details and try again.": t.messages.cardRequestInvalid,
    "The card request could not be submitted.": t.messages.cardRequestFailed,
    "Your card request is pending approval.": t.messages.cardRequestPending,
    "Enter a valid Citizavrexo account number.": t.messages.recipientInvalid,
    "The recipient could not be verified.": t.messages.recipientLookupFailed,
    "Check the transfer details and enter a valid amount.": t.messages.transferInvalid,
    "The transfer could not be completed.": t.messages.transferFailed,
    "Transfer completed.": t.messages.transferComplete,
    "Check the withdrawal details and enter a valid amount.": t.messages.withdrawalInvalid,
    "The withdrawal request could not be submitted.": t.messages.withdrawalFailed,
    "Withdrawal Request Received": t.messages.withdrawalReceived,
    "The withdrawal request is invalid.": t.messages.withdrawalInvalidRequest,
    "Withdrawal request cancelled.": t.messages.withdrawalCancelled,
    "The withdrawal request could not be cancelled.": t.messages.withdrawalCancelFailed,
    "Check the bank account details and try again.": t.messages.destinationInvalid,
    "Bank destination saved.": t.messages.destinationSaved,
    "The bank destination could not be saved.": t.messages.destinationSaveFailed,
    "Choose a JPEG, PNG, or WebP image.": t.messages.profileImageInvalid,
    "Profile photo updated.": t.messages.profileImageSaved,
    "The profile photo could not be saved.": t.messages.profileImageFailed,
    "No eligible recipient was found for that account number.": t.messages.transferRecipientNotFound,
    "You cannot send money to your own account.": t.messages.ownAccountTransfer,
    "The recipient account uses a different currency.": t.messages.currencyMismatch,
    "Insufficient available balance.": t.messages.insufficientBalance,
  };

  if (map[message]) return map[message];
  if (safeDomainMessages.has(message)) return message;
  return t.messages.genericActionError;
}

export function localizeUserStatus(locale: Locale, status: string): string {
  const { app } = userUi(locale);
  const key = status as keyof typeof app.statuses;
  return app.statuses[key] ?? status.replaceAll("_", " ");
}

export function localizeNotification(locale: Locale, notification: Notification) {
  const t = userUi(locale);
  const kindTitleMap: Record<NotificationKind, string> = {
    credit: t.app.nav.notifications,
    debit: t.app.nav.notifications,
    transfer: t.app.nav.notifications,
    transaction: t.app.nav.transactions,
    security: t.app.nav.security,
    system: t.app.settings,
  };
  const lowerTitle = notification.title.toLowerCase();
  const lowerMessage = notification.message.toLowerCase();
  const titleMap: Record<string, string> = {
    "money added to your account": t.notifications.titleMoneyAdded,
    "account suspended": t.notifications.titleAccountSuspended,
    "account restored": t.notifications.titleAccountRestored,
    "welcome to citizavrexo": t.notifications.titleWelcome,
    "welcome to citizavrexo core": t.notifications.titleWelcome,
    "physical card request submitted": t.notifications.titleCardRequestSubmitted,
    "physical card request approved": t.notifications.titleCardRequestApproved,
    "physical card request rejected": t.notifications.titleCardRequestRejected,
    "account credited": t.notifications.titleAccountCredited,
    "account debited": t.notifications.titleAccountDebited,
    "transfer completed": t.notifications.titleTransferCompleted,
    "transfer received": t.notifications.titleTransferReceived,
    "withdrawal request received": t.notifications.titleWithdrawalReceived,
    "withdrawal request completed": t.notifications.titleWithdrawalCompleted,
    "withdrawal request rejected": t.notifications.titleWithdrawalRejected,
  };

  let title = titleMap[lowerTitle] ?? notification.title ?? kindTitleMap[notification.kind];
  if (lowerTitle.includes("new device") || lowerTitle.includes("password")) title = t.app.nav.security;

  let message = notification.message;
  if (lowerTitle === "money added to your account") {
    const amount = notification.message.match(/^\$[\d,]+\.\d{2}/)?.[0];
    message = `${amount ? `${amount} · ` : ""}${t.notifications.titleMoneyAdded}. ${t.email.reference}: ${notification.eventReference}.`;
  } else if (lowerTitle === "account suspended" || lowerTitle === "account restored") {
    message = title;
  } else if (lowerTitle === "account credited" || lowerTitle === "account debited") {
    message = title;
  } else if (notification.message === "Your account is verified and ready. Review your profile and security settings to finish setup.") {
    message = t.notifications.messageWelcomeReady;
  } else if (notification.message === "Please contact Citizavrexo Customer Service to complete this transaction.") {
    message = t.notifications.messageWithdrawalService;
  } else if (notification.message === "Customer Service marked your withdrawal request as completed. No balance was changed by Citizavrexo.") {
    message = t.notifications.messageWithdrawalCompleted;
  } else if (notification.message === "Your withdrawal request was rejected. Open Citizavrexo to review its status.") {
    message = t.notifications.messageWithdrawalRejected;
  } else if (notification.message === "Your physical card request is pending review.") {
    message = t.notifications.messageCardPending;
  } else if (notification.message === "Your physical card is now available in Cards.") {
    message = t.notifications.messageCardAvailable;
  } else if (notification.message === "Your physical card request was not approved.") {
    message = t.notifications.messageCardRejected;
  } else if (lowerMessage.startsWith("your transfer to ")) {
    message = `${t.notifications.messageTransferCompletedPrefix} ${notification.message.slice("Your transfer to ".length)}`;
  } else if (lowerMessage.startsWith("your transfer of ")) {
    message = `${t.notifications.messageTransferCompletedPrefix} ${notification.message.slice("Your transfer of ".length)}`;
  } else if (lowerMessage.startsWith("you received a transfer from ")) {
    message = `${t.notifications.messageTransferReceivedPrefix} ${notification.message.slice("You received a transfer from ".length)}`;
  } else if (/^\$[\d,]+\.\d{2} was received from /i.test(notification.message)) {
    message = `${t.notifications.messageTransferReceivedPrefix} ${notification.message.replace(/ was received from /i, " · ")}`;
  }

  return {
    title,
    message,
  };
}

