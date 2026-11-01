"use client";

import {
  ArrowDownLeft,
  ArrowLeft,
  Check,
  History,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { createContext, useActionState, useContext, useEffect, useRef, useState } from "react";
import {
  cancelWithdrawalAction,
  createBankDestinationAction,
  createTransferQuoteAction,
  deleteBankDestinationAction,
  lookupTransferRecipientAction,
  requestWithdrawalAction,
  sendMoneyAction,
  verifyTransactionAuthorizationCodeAction,
  verifyWithdrawalCodeAction,
  verifyWithdrawalSwiftCodeAction,
} from "@/app/user-actions";
import type { Account, BankDestination, WithdrawalRequest } from "@/lib/domain";
import type { Locale } from "@/lib/i18n/config";
import {
  localizeAccountName,
  localizeUserActionMessage,
  userUi,
} from "@/lib/i18n/user-ui";
import { TransferReceiptCard } from "@/components/transfer-receipt";
import { withdrawalSupportMessage } from "@/lib/customer-service-config";
import { currencyFractionDigits, formatCurrencyAmount, type Currency } from "@/lib/currency";
import { minorToMajor } from "@/lib/money";

const LocaleContext = createContext<Locale>("en");

const money = (amount: number, currency: string, locale: string) => {
  void locale;
  return formatCurrencyAmount(amount, currency, "en-US");
};
const dateTime = (value: string, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
const validAmount = (value: string, currency: Currency) => {
  const digits = currencyFractionDigits(currency);
  return new RegExp(`^(0|[1-9]\\d{0,12})${digits ? `(?:\\.\\d{1,${digits}})?` : ""}$`).test(value) && Number(value) > 0;
};

export function MoneyWorkflowButtons({
  accounts,
  destinations,
  withdrawals,
  customerService,
  locale,
  onHistory,
  compact = false,
}: {
  accounts: Account[];
  destinations: BankDestination[];
  withdrawals: WithdrawalRequest[];
  customerService: { whatsappNumber: string; whatsappUrl: string; lineUrl: string; email?: string };
  locale: Locale;
  onHistory?: () => void;
  compact?: boolean;
}) {
  const [flow, setFlow] = useState<"send" | "withdraw" | null>(null);
  const [addedDestinations, setAddedDestinations] = useState<BankDestination[]>([]);
  const text = userUi(locale).money;
  const activeAccounts = accounts.filter(
    (account) => account.status === "active",
  );
  const savedDestinations = [...addedDestinations, ...destinations.filter((destination) => !addedDestinations.some((added) => added.id === destination.id))];
  return (
    <LocaleContext.Provider value={locale}>
      <div className={compact ? "account-actions" : "quick-actions"}>
        <ActionButton
          compact={compact}
          icon={Send}
          label={text.send}
          disabled={!activeAccounts.length}
          onClick={() => setFlow("send")}
        />
        <ActionButton
          compact={compact}
          icon={ArrowDownLeft}
          label={text.withdraw}
          disabled={!activeAccounts.length}
          onClick={() => setFlow("withdraw")}
        />
        {!compact && (
          <ActionButton
            icon={History}
            label={text.history}
            disabled={!onHistory}
            onClick={onHistory}
          />
        )}
        {!compact && (
          <ActionButton
            icon={MoreHorizontal}
            label={text.more}
            disabled
            title={text.unavailable}
          />
        )}
      </div>
      {flow === "send" && (
        <SendMoneyDialog
          accounts={activeAccounts}
          locale={locale}
          close={() => setFlow(null)}
        />
      )}
      {flow === "withdraw" && (
        <WithdrawalDialog
          accounts={activeAccounts}
          destinations={savedDestinations}
          onDestinationCreated={(destination) => setAddedDestinations((current) => [destination, ...current.filter((item) => item.id !== destination.id)])}
          customerService={customerService}
          locale={locale}
          close={() => setFlow(null)}
        />
      )}
      {compact && (
        <WithdrawalHistory
          requests={withdrawals}
          accounts={accounts}
          locale={locale}
        />
      )}
    </LocaleContext.Provider>
  );
}

function ActionButton({
  icon: Icon,
  label,
  compact,
  ...props
}: {
  icon: typeof Send;
  label: string;
  compact?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={compact ? "button secondary" : undefined}
      {...props}
    >
      {compact ? (
        <Icon size={17} />
      ) : (
        <span>
          <Icon size={21} />
        </span>
      )}
      <b>{label}</b>
    </button>
  );
}

function SendMoneyDialog({
  accounts,
  locale,
  close,
}: {
  accounts: Account[];
  locale: Locale;
  close: () => void;
}) {
  const text = userUi(locale).money;
  const [senderId, setSenderId] = useState(accounts[0]?.id ?? "");
  const [lookupState, lookupAction, looking] = useActionState(
    lookupTransferRecipientAction,
    {},
  );
  const [sendState, sendAction, sending] = useActionState(sendMoneyAction, {});
  const [verificationState, verificationAction, verifying] = useActionState(verifyTransactionAuthorizationCodeAction, {});
  const [quoteState, quoteAction, quoting] = useActionState(createTransferQuoteAction, {});
  const [amount, setAmount] = useState("");
  const sender =
    accounts.find((account) => account.id === senderId) ?? accounts[0];
  const recipient = lookupState.recipient;
  const quote = quoteState.quote;
  const [pinStep, setPinStep] = useState(false);
  const [idempotencyKey] = useState(() => `transfer-ui-${crypto.randomUUID()}`);

  return (
    <Modal
      title={
        verificationState.receipt || sendState.receipt
          ? text.complete
          : sendState.transactionAuthorizationRequestId
            ? "Transaction authorization"
          : pinStep
            ? "Authorize transfer"
          : quote
            ? text.review
            : text.sendTitle
      }
      eyebrow={text.send}
      close={close}
      closeLabel={text.close}
    >
      {sending || verifying ? (
        <WorkflowPending label="Processing transfer..." />
      ) : (verificationState.receipt || sendState.receipt) ? (
        <div className="workflow-success" role="status">
          <TransferReceiptCard receipt={(verificationState.receipt ?? sendState.receipt)!} locale={locale} />
          <button className="button primary" type="button" onClick={close}>
            {text.done}
          </button>
        </div>
      ) : sendState.transactionAuthorizationRequestId ? (
        <form action={verificationAction} className="review-form pin-authorization-form" aria-label="Enter transaction authorization code">
          <input type="hidden" name="requestId" value={sendState.transactionAuthorizationRequestId} />
          <div className="recipient-confirm">
            <span>REQUEST SUBMITTED</span>
            <b>Administrator authorization pending</b>
            <small>Reference {sendState.transactionAuthorizationReference}</small>
          </div>
          <p className="note">An administrator will issue a single-use code for this exact transfer. The code is also sent to your verified email and expires 15 minutes after issue.</p>
          <label className="workflow-field">Transaction authorization code<input name="code" inputMode="text" pattern="[A-Za-z0-9]{4}-[A-Za-z0-9]{4}" minLength={9} maxLength={9} autoComplete="one-time-code" placeholder="XXXX-XXXX" required autoFocus /></label>
          {verificationState.error && <p className="auth-message error" role="alert">{localizeUserActionMessage(locale, verificationState.error)}</p>}
          <div className="modal-actions">
            <button className="button secondary" type="button" onClick={close}>{text.cancel}</button>
            <button className="button primary">Verify and send</button>
          </div>
        </form>
      ) : pinStep && quote ? (
        <form action={sendAction} className="review-form pin-authorization-form" aria-label="Authorize transfer with Transaction PIN">
          <input type="hidden" name="quoteId" value={quote.id} />
          <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
          <p className="note">Enter your 4-digit Transaction PIN to authorize this exact transfer.</p>
          <label className="workflow-field">Transaction PIN<input className="pin-input" name="pin" type="password" inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} autoComplete="off" enterKeyHint="done" required autoFocus /></label>
          {sendState.error && <p className="auth-message error" role="alert">{localizeUserActionMessage(locale, sendState.error)}</p>}
          <div className="modal-actions">
            <button className="button secondary" type="button" onClick={() => setPinStep(false)}><ArrowLeft size={16} />{text.back}</button>
            <button className="button primary" disabled={!idempotencyKey} aria-label="Request transaction authorization">Request authorization</button>
          </div>
        </form>
      ) : quote && recipient && sender ? (
        <>
          <div className="transfer-review-intro"><span className="receipt-status"><Check size={16}/>Rate secured</span><p>{text.transferSummary}</p></div>
          <dl className="review-details">
            <div>
              <dt>{text.from}</dt>
              <dd>
                {localizeAccountName(locale, sender.name)} · ••{" "}
                {sender.number.slice(-4)}
              </dd>
            </div>
            <div>
              <dt>{text.recipient}</dt>
              <dd>{quote.recipientName}</dd>
            </div>
            <div>
              <dt>{text.account}</dt>
              <dd>
                {localizeAccountName(locale, recipient.accountName)} · {quote.maskedAccountNumber} · {quote.recipientCurrency}
              </dd>
            </div>
            <div>
              <dt>{text.amount}</dt>
              <dd>{money(quote.sourceAmount, quote.sourceCurrency, locale)} {quote.sourceCurrency}</dd>
            </div>
            <div>
              <dt>Recipient receives</dt>
              <dd>{money(quote.recipientAmount, quote.recipientCurrency, locale)} {quote.recipientCurrency}</dd>
            </div>
            <div>
              <dt>Exchange rate</dt>
              <dd>1 {quote.sourceCurrency} = {quote.exchangeRate} {quote.recipientCurrency}</dd>
            </div>
            <div>
              <dt>Rate date</dt>
              <dd>{dateTime(quote.rateTimestamp, locale)} · {quote.rateProvider === "same_currency" ? "Citizavrexo 1:1" : quote.rateProvider.replaceAll("_", " ")}</dd>
            </div>
            <div>
              <dt>Fees</dt>
              <dd>{money(0, quote.sourceCurrency, locale)} {quote.sourceCurrency}</dd>
            </div>
          </dl>
          <div className="modal-actions">
            <button className="button secondary" type="button" onClick={close}><ArrowLeft size={16} />{text.back}</button>
            <button className="button primary" type="button" onClick={() => setPinStep(true)}>Confirm Transfer</button>
          </div>
        </>
      ) : recipient && sender ? (
        <>
          <div className="recipient-confirm">
            <span>{text.recipient}</span>
            <b>{recipient.userName}</b>
            <small>
              {localizeAccountName(locale, recipient.accountName)} ·{" "}
              {recipient.maskedAccountNumber} · {recipient.currency}
            </small>
          </div>
          <form action={quoteAction} className="form-grid modal-form">
            <input type="hidden" name="senderAccountId" value={sender.id}/>
            <input type="hidden" name="recipientAccountNumber" value={recipient.accountNumber}/>
            <label className="workflow-field">
              {text.amount}
              <input name="amount" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" aria-label={text.amount}/>
            </label>
            {quoteState.error && <p className="auth-message error" role="alert">{localizeUserActionMessage(locale, quoteState.error)}</p>}
            <div className="modal-actions">
              <button className="button secondary" type="button" onClick={close}>{text.cancel}</button>
              <button className="button primary" disabled={quoting || !validAmount(amount, sender.currency) || Number(amount) > sender.balance}>{quoting ? "Securing rate..." : text.continue}</button>
            </div>
          </form>
        </>
      ) : (
        <>
          <p>{text.sendText}</p>
          <form action={lookupAction} className="form-grid modal-form">
            <label>
              {text.from}
              <select
                name="senderAccountId"
                value={senderId}
                onChange={(event) => setSenderId(event.target.value)}
              >
                {accounts.map((account) => (
                  <option value={account.id} key={account.id}>
                    {localizeAccountName(locale, account.name)} ·{" "}
                    {account.currency} · •• {account.number.slice(-4)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {text.recipientAccount}
              <input
                name="accountNumber"
                required
                minLength={10}
                maxLength={10}
                inputMode="numeric"
                pattern="[0-9]{10}"
                autoComplete="off"
              />
            </label>
            <div className="modal-actions">
              <button
                className="button secondary"
                type="button"
                onClick={close}
              >
                {text.cancel}
              </button>
              <button className="button primary" disabled={looking}>
                {looking ? text.finding : text.find}
              </button>
            </div>
          </form>
        </>
      )}
      {(lookupState.error || (!pinStep && sendState.error)) && (
        <p className="auth-message error" role="alert">
          {localizeUserActionMessage(
            locale,
            sendState.error ?? lookupState.error,
          )}
        </p>
      )}
    </Modal>
  );
}

function WithdrawalDialog({
  accounts,
  destinations,
  onDestinationCreated,
  customerService,
  locale,
  close,
}: {
  accounts: Account[];
  destinations: BankDestination[];
  onDestinationCreated: (destination: BankDestination) => void;
  customerService: { whatsappNumber: string; whatsappUrl: string; lineUrl: string; email?: string };
  locale: Locale;
  close: () => void;
}) {
  const text = userUi(locale).money;
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [state, action, pending] = useActionState(requestWithdrawalAction, {});
  const [withdrawalCodeState, verifyWithdrawalCode, verifyingWithdrawalCode] = useActionState(verifyWithdrawalCodeAction, {});
  const [swiftCodeState, verifySwiftCode, verifyingSwiftCode] = useActionState(verifyWithdrawalSwiftCodeAction, {});
  const [withdrawalCode, setWithdrawalCode] = useState("");
  const [swiftCode, setSwiftCode] = useState("");
  const account = accounts.find((item) => item.id === accountId) ?? accounts[0];
  const availableDestinations = destinations.filter(
    (item) => item.currency === account?.currency,
  );
  const [destinationId, setDestinationId] = useState(
    availableDestinations[0]?.id ?? "",
  );
  const destination =
    availableDestinations.find((item) => item.id === destinationId) ??
    availableDestinations[0];
  const [idempotencyKey] = useState(
    () => `withdrawal-ui-${crypto.randomUUID()}`,
  );
  const currentRequestId = swiftCodeState.withdrawalRequestId ?? withdrawalCodeState.withdrawalRequestId ?? state.withdrawalRequestId;
  const currentReference = swiftCodeState.reference ?? withdrawalCodeState.reference ?? state.reference;
  const currentSupport = swiftCodeState.withdrawalSupport ?? withdrawalCodeState.withdrawalSupport ?? state.withdrawalSupport;
  const currentStage = swiftCodeState.authorizationStage ?? withdrawalCodeState.authorizationStage ?? state.authorizationStage;
  const authorizationCompleted = Boolean(swiftCodeState.authorizationCompleted ?? withdrawalCodeState.authorizationCompleted ?? state.authorizationCompleted);
  const currentError = swiftCodeState.error ?? withdrawalCodeState.error ?? state.error;
  const stageOneComplete = currentStage === "awaiting_swift_code" || currentStage === "authorized";
  const supportMessage = currentSupport
    ? withdrawalSupportMessage(text.supportMessageTemplate, {
        reference: currentSupport.reference,
        amount: money(minorToMajor(currentSupport.amountMinor, currentSupport.currency), currentSupport.currency, locale),
        bankName: currentSupport.bankName,
        accountName: currentSupport.accountName,
        maskedAccountNumber: currentSupport.maskedAccountNumber,
      })
    : "";

  return (
    <Modal
      title={
        authorizationCompleted
          ? "Withdrawal authorization completed"
          : currentStage === "awaiting_swift_code"
            ? "SWIFT Authorization Required!"
            : currentStage === "awaiting_withdrawal_code"
              ? "Before You Proceed!"
              : state.success
          ? text.received
          : reviewing
            ? text.reviewWithdrawal
            : text.withdrawTitle
      }
      eyebrow={text.withdraw}
      close={close}
      closeLabel={text.close}
    >
      {pending || verifyingWithdrawalCode || verifyingSwiftCode ? (
        <WorkflowPending label="Submitting withdrawal..." />
      ) : authorizationCompleted && currentSupport && currentReference ? (
        <div className="workflow-success" role="status">
          <Check size={30} />
          <h3>Withdrawal authorization completed</h3>
          <p>Your withdrawal request is now awaiting administrator review and customer-service completion.</p>
          <small>
            {text.reference}: {currentReference}
          </small>
          <div className="support-actions">
            <a
              className="button primary"
              href={customerService.whatsappUrl}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle size={17} />
              WhatsApp
            </a>
            <a
              className="button secondary"
              href={customerService.lineUrl}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle size={17} />
              LINE
            </a>
            {customerService.email && (
              <a
                className="button secondary"
                href={`mailto:${customerService.email}?subject=${encodeURIComponent(`Withdrawal ${currentReference}`)}&body=${encodeURIComponent(supportMessage)}`}
              >
                <Mail size={17} />
                Email
              </a>
            )}
          </div>
          <button className="button secondary" type="button" onClick={close}>
            {text.done}
          </button>
        </div>
      ) : currentStage === "awaiting_withdrawal_code" && currentRequestId ? (
        <form action={verifyWithdrawalCode} className="review-form" aria-label="Withdrawal code verification">
          <input type="hidden" name="requestId" value={currentRequestId} />
          <h3>Before You Proceed!</h3>
          <p>
            Additional verification is required. To proceed with your withdrawal, please enter your withdrawal code issued by our Customer Service team.
          </p>
          <label className="workflow-field">
            WITHDRAWAL CODE
            <input
              name="code"
              value={withdrawalCode}
              onChange={(event) => setWithdrawalCode(event.target.value)}
              autoComplete="off"
              placeholder="Enter withdrawal code"
              required
            />
          </label>
          <div className="modal-actions">
            <button className="button primary" disabled={!withdrawalCode.trim()}>
              Confirm Withdrawal Code
            </button>
          </div>
        </form>
      ) : currentStage === "awaiting_swift_code" && currentRequestId ? (
        <form action={verifySwiftCode} className="review-form" aria-label="SWIFT authorization code verification">
          <input type="hidden" name="requestId" value={currentRequestId} />
          <div className="transfer-review-intro">
            <span className="receipt-status">
              <Check size={16} />
              Initial verification succeeded
            </span>
          </div>
          <h3>SWIFT Authorization Required!</h3>
          <p>
            Your initial verification has been completed. Please provide your SWIFT Authorization Code to continue with the withdrawal authorization process.
          </p>
          <label className="workflow-field">
            SWIFT AUTHORIZATION CODE
            <input
              name="code"
              value={swiftCode}
              onChange={(event) => setSwiftCode(event.target.value)}
              autoComplete="off"
              placeholder="Enter SWIFT authorization code"
              required
            />
          </label>
          <div className="modal-actions">
            <button className="button primary" disabled={!swiftCode.trim()}>
              Verify SWIFT Code
            </button>
          </div>
        </form>
      ) : state.success ? (
        <div className="workflow-success" role="status">
          <Check size={30} />
          <h3>{text.received}</h3>
          <p>{text.service}</p>
          <small>
            {text.reference}: {state.reference}
          </small>
        </div>
      ) : reviewing && account && destination ? (
        <>
          <p>{text.withdrawalSummary}</p>
          <dl className="review-details">
            <div>
              <dt>{text.account}</dt>
              <dd>
                {localizeAccountName(locale, account.name)} · ••{" "}
                {account.number.slice(-4)}
              </dd>
            </div>
            <div>
              <dt>{text.destinationLabel}</dt>
              <dd>
                {destination.bankName} · {destination.accountName} · ••{" "}
                {destination.accountNumber.slice(-4)}
              </dd>
            </div>
            <div>
              <dt>{text.amount}</dt>
              <dd>{money(Number(amount), account.currency, locale)}</dd>
            </div>
          </dl>
          <form action={action} className="review-form">
            <input type="hidden" name="accountId" value={account.id} />
            <input type="hidden" name="destinationId" value={destination.id} />
            <input type="hidden" name="amount" value={amount} />
            <input type="hidden" name="currency" value={account.currency} />
            <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
            <label className="workflow-field">
              Transaction PIN
              <input
                name="pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4}"
                minLength={4}
                maxLength={4}
                autoComplete="off"
                required
              />
            </label>
            <div className="modal-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => setReviewing(false)}
              >
                <ArrowLeft size={16} />
                {text.back}
              </button>
              <button
                className="button primary"
                disabled={pending || !idempotencyKey}
              >
                {pending ? text.submitting : text.submitWithdrawal}
              </button>
            </div>
          </form>
        </>
      ) : (
        <>
          <p>{text.withdrawText}</p>
          <div className="form-grid modal-form">
            <label>
              {text.account}
              <select
                value={accountId}
                onChange={(event) => {
                  setAccountId(event.target.value);
                  const nextAccount = accounts.find(
                    (item) => item.id === event.target.value,
                  );
                  setDestinationId(
                    destinations.find(
                      (item) => item.currency === nextAccount?.currency,
                    )?.id ?? "",
                  );
                }}
              >
                {accounts.map((item) => (
                  <option value={item.id} key={item.id}>
                    {localizeAccountName(locale, item.name)} · {item.currency} ·{" "}
                    {money(item.balance, item.currency, locale)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {text.destinationLabel}
              <select
                value={destination?.id ?? ""}
                onChange={(event) => setDestinationId(event.target.value)}
                disabled={!availableDestinations.length}
              >
                <option value="">
                  {availableDestinations.length
                    ? text.selectDestination
                    : text.noDestinationForCurrency.replace(
                        "{currency}",
                        account?.currency ?? "",
                      )}
                </option>
                {availableDestinations.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.label} · {item.bankName} · ••{" "}
                    {item.accountNumber.slice(-4)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {text.amount}
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                aria-label={text.amount}
              />
            </label>
            <DestinationManager destinations={destinations} currency={account?.currency ?? "USD"} onCreated={(created) => { onDestinationCreated(created); setDestinationId(created.id); }} />
            <div className="modal-actions">
              <button
                className="button secondary"
                type="button"
                onClick={close}
              >
                {text.cancel}
              </button>
              <button
                className="button primary"
                type="button"
                disabled={
                  !account ||
                  !destination ||
                  !validAmount(amount, account.currency) ||
                  Number(amount) > account.balance
                }
                onClick={() => setReviewing(true)}
              >
                {text.continue}
              </button>
            </div>
          </div>
        </>
      )}
      {currentError && (
        <p className="auth-message error" role="alert">
          {localizeUserActionMessage(locale, currentError)}
        </p>
      )}
      {stageOneComplete && !authorizationCompleted && (
        <p className="note">
          Initial authorization succeeded. Awaiting SWIFT authorization code issuance by an authorized administrator.
        </p>
      )}
    </Modal>
  );
}

function DestinationManager({
  destinations,
  currency,
  onCreated,
}: {
  destinations: BankDestination[];
  currency: Currency;
  onCreated: (destination: BankDestination) => void;
}) {
  const [state, action, pending] = useActionState(
    createBankDestinationAction,
    {},
  );
  const locale = useContext(LocaleContext);
  const text = userUi(locale).destination;
  const reportedDestinationId = useRef<string | null>(null);
  useEffect(() => {
    if (state.destination && reportedDestinationId.current !== state.destination.id) {
      reportedDestinationId.current = state.destination.id;
      onCreated(state.destination);
    }
  }, [state.destination, onCreated]);
  return (
    <details className="destination-manager">
      <summary>
        <Plus size={16} />
        {text.add}
      </summary>
      <form action={action} className="form-grid">
        <label>
          {text.label}
          <input
            name="label"
            required
            minLength={2}
            maxLength={40}
            placeholder={text.labelPlaceholder}
          />
        </label>
        <label>
          {text.bank}
          <input name="bankName" required minLength={2} maxLength={100} />
        </label>
        <label>
          {text.accountName}
          <input name="accountName" required minLength={2} maxLength={100} />
        </label>
        <label>
          {text.accountNumber}
          <input
            name="accountNumber"
            required
            minLength={6}
            maxLength={34}
            autoComplete="off"
          />
        </label>
        <label>
          {text.country}
          <input
            name="country"
            required
            minLength={2}
            maxLength={2}
            placeholder="US"
          />
        </label>
        <label>
          {text.type}
          <select name="destinationType" defaultValue="bank_account">
            <option value="bank_account">{text.bankAccount}</option>
          </select>
        </label>
        <input name="currency" type="hidden" value={currency} />
        <button className="button secondary" disabled={pending} aria-busy={pending}>
          {pending ? text.saving : text.save}
        </button>
        {state.error && (
          <p className="auth-message error" role="alert">
            {localizeUserActionMessage(locale, state.error)}
          </p>
        )}
        {state.success && (
          <p className="auth-message success" role="status">
            {localizeUserActionMessage(locale, state.success)}
          </p>
        )}
      </form>
      {destinations.length > 0 && (
        <div className="destination-list">
          {destinations.map((item) => (
            <div key={item.id}>
              <span>
                <b>{item.label}</b>
                <small>
                  {item.bankName} · {item.country} · ••{" "}
                  {item.accountNumber.slice(-4)} · {item.currency}
                </small>
              </span>
              <form action={deleteBankDestinationAction}>
                <input type="hidden" name="destinationId" value={item.id} />
                <button
                  className="icon-button"
                  aria-label={`${text.delete} ${item.label}`}
                >
                  <Trash2 size={16} />
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </details>
  );
}

function WithdrawalHistory({
  requests,
  accounts,
  locale,
}: {
  requests: WithdrawalRequest[];
  accounts: Account[];
  locale: Locale;
}) {
  const text = userUi(locale).money;
  const destination = userUi(locale).destination;
  return (
    <section className="panel request-history">
      <div className="panel-title">
        <div>
          <span className="eyebrow">{text.submitted.toUpperCase()}</span>
          <h2>{text.requests}</h2>
        </div>
      </div>
      {requests.map((request) => (
        <div className="request-row" key={request.id}>
          <span>
            <b>{money(request.amount, request.currency, locale)}</b>
            <small>
              {(() => {
                const accountName = accounts.find(
                  (account) => account.id === request.accountId,
                )?.name;
                return accountName
                  ? localizeAccountName(locale, accountName)
                  : text.account;
              })()}{" "}
              ·{" "}
              {request.destinationBankName
                ? `${request.destinationBankName} · •• ${request.destinationAccountNumber?.slice(-4)}`
                : destination.legacy}{" "}
              · {dateTime(request.submittedAt, locale)}
            </small>
          </span>
          <span>
            <span className={`status status-${request.status}`}>
              {text.statuses[request.status]}
            </span>
            {request.status === "pending" && (
              <CancelWithdrawalButton
                requestId={request.id}
                text={text}
                locale={locale}
              />
            )}
          </span>
        </div>
      ))}
      {!requests.length && (
        <div className="empty-state">
          <ArrowDownLeft size={24} />
          <p>{text.empty}</p>
        </div>
      )}
    </section>
  );
}

function CancelWithdrawalButton({
  requestId,
  text,
  locale,
}: {
  requestId: string;
  text: ReturnType<typeof userUi>["money"];
  locale: Locale;
}) {
  const [state, action, pending] = useActionState(cancelWithdrawalAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="requestId" value={requestId} />
      <button className="text-button danger-text" disabled={pending}>
        {pending ? text.cancelling : text.cancelRequest}
      </button>
      {state.error && (
        <small className="danger-text" role="alert">
          {localizeUserActionMessage(locale, state.error)}
        </small>
      )}
    </form>
  );
}

function Modal({
  title,
  eyebrow,
  close,
  closeLabel,
  children,
}: {
  title: string;
  eyebrow: string;
  close: () => void;
  closeLabel: string;
  children: React.ReactNode;
}) {
  const modalRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;
    const revealFocusedControl = () => {
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && modal.contains(focused)) {
        requestAnimationFrame(() => focused.scrollIntoView({ block: "center", behavior: "smooth" }));
      }
    };
    modal.addEventListener("focusin", revealFocusedControl);
    window.visualViewport?.addEventListener("resize", revealFocusedControl);
    return () => {
      modal.removeEventListener("focusin", revealFocusedControl);
      window.visualViewport?.removeEventListener("resize", revealFocusedControl);
    };
  }, []);
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        ref={modalRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="money-workflow-title"
      >
        <div className="panel-title">
          <div>
            <span className="eyebrow">{eyebrow.toUpperCase()}</span>
            <h2 id="money-workflow-title">{title}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label={closeLabel}
            onClick={close}
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function WorkflowPending({ label }: { label: string }) {
  return <div className="workflow-pending" role="status" aria-live="polite" aria-busy="true"><span className="loading-mark" aria-hidden="true"/><b>{label}</b><small>Please keep this window open.</small></div>;
}

