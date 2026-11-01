"use client";

import Link from "next/link";
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  CircleHelp,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  Fingerprint,
  Globe2,
  Home,
  Landmark,
  Languages,
  Laptop,
  LockKeyhole,
  LogOut,
  Menu,
  Moon,
  ReceiptText,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Snowflake,
  Sun,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import {
  startTransition,
  useActionState,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  Account,
  AuditEvent,
  AuthorizedDevice,
  BankDestination,
  CardRequest,
  CurrencyChangeRequest,
  ManagedCard,
  Notification,
  RecoveryRequest,
  Transaction,
  User,
  UserProfile,
  WithdrawalRequest,
} from "@/lib/domain";
import { CardRequestPanel } from "@/components/card-request-panel";
import { ProfileCompletionForm } from "@/components/profile-completion-form";
import { MoneyWorkflowButtons } from "@/components/money-workflows";
import { TransferReceiptCard } from "@/components/transfer-receipt";
import { TransactionPinPanel } from "@/components/transaction-pin-panel";
import { logoutAction } from "@/app/auth-actions";
import {
  generateRecoveryCodesAction,
  logoutAllDevicesAction,
  markAllNotificationsRead,
  markNotificationRead,
  revokeDevice,
  toggleCardCapability,
  toggleCardFreeze,
  uploadProfileImageAction,
  savePreferencesAction,
} from "@/app/user-actions";
import { currencyConfig, formatCurrencyAmount, SUPPORTED_CURRENCIES, type Currency } from "@/lib/currency";
import { CurrencyChangePanel } from "@/components/currency-change-panel";
import { localeNames, resolveSupportedLocale, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/config";
import { localizeAccountName, localizeNotification, localizeTransactionDescription, localizeTransactionType, localizeUserActionMessage, localizeUserStatus, userUi } from "@/lib/i18n/user-ui";
import { BrandLogo } from "@/components/brand-logo";

type Workspace = {
  user: User;
  profile: UserProfile;
  transactionPinConfigured: boolean;
  accounts: Account[];
  transactions: Transaction[];
  cards: ManagedCard[];
  cardRequests: CardRequest[];
  bankDestinations: BankDestination[];
  withdrawalRequests: WithdrawalRequest[];
  currencyChangeRequests: CurrencyChangeRequest[];
  notifications: Notification[];
  devices: AuthorizedDevice[];
  recoveryRequests: RecoveryRequest[];
  auditEvents: AuditEvent[];
  customerService: { lineUrl: string; email?: string };
};
type View =
  | "home"
  | "accounts"
  | "transactions"
  | "cards"
  | "notifications"
  | "profile"
  | "security"
  | "settings";
const nav = [
  ["home", Home],
  ["accounts", Landmark],
  ["transactions", ReceiptText],
  ["cards", CreditCard],
  ["notifications", Bell],
  ["profile", UserRound],
  ["security", ShieldCheck],
  ["settings", Settings],
] as const;
const money = (amount: number, currency: string, locale = "en-US") => {
  return formatCurrencyAmount(Math.abs(amount), currency, locale);
};
const when = (value: string, locale = "en-NG") =>
  new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
const Status = ({ value, locale }: { value: string; locale: Locale }) => (
  <span className={`status status-${value}`}>{localizeUserStatus(locale, value)}</span>
);
const Logo = ({ tone = "light" }: { tone?: "light" | "dark" }) => <div className="brand"><BrandLogo tone={tone}/></div>;
const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
function downloadTransactions(items: Transaction[], locale: Locale) {
  const t = userUi(locale).app;
  const headers = [t.transactionsView.tableReference, t.transactionsView.tableTransaction, t.transactionsView.type, t.transactionsView.tableAmount, t.accountsView.currency, t.transactionsView.tableStatus, t.transactionsView.tableDate, t.transactionsView.balanceBefore, t.transactionsView.balanceAfter];
  const rows = [headers, ...items.map((item) => [item.reference, localizeTransactionDescription(locale, item.description), localizeTransactionType(locale, item.type), item.amount, item.currency, localizeUserStatus(locale, item.status), item.occurredAt, item.balanceBefore, item.balanceAfter])];
  const url = URL.createObjectURL(new Blob([rows.map((row) => row.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "Citizavrexo-transactions.csv";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function CitizavrexoApp({ data }: { data: Workspace }) {
  const [view, setView] = useState<View>("home");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [locale, setLocale] = useState<Locale>(data.user.locale);
  const [displayCurrency, setDisplayCurrency] = useState<Currency>(data.user.displayCurrency);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const storedTheme = localStorage.getItem("Citizavrexo-theme") as
        | "light"
        | "dark"
        | null;
      const storedLocale = localStorage.getItem("Citizavrexo-locale");
      const detected = resolveSupportedLocale(navigator.language);
      setTheme(
        storedTheme ??
          (matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light"),
      );
      const initialLocale = storedLocale ? resolveSupportedLocale(storedLocale) : data.user.locale === "en" ? detected : data.user.locale;
      setLocale(initialLocale);
      if (!storedLocale && initialLocale !== data.user.locale) void savePreferencesAction({ locale: initialLocale, displayCurrency: data.user.displayCurrency });
      setPreferencesReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [data.user.displayCurrency, data.user.locale]);
  useEffect(() => {
    if (preferencesReady) {
      document.documentElement.dataset.theme = theme;
      localStorage.setItem("Citizavrexo-theme", theme);
    }
  }, [theme, preferencesReady]);
  useEffect(() => {
    if (preferencesReady) {
      document.documentElement.lang = locale;
      localStorage.setItem("Citizavrexo-locale", locale);
    }
  }, [locale, preferencesReady]);
  const go = (next: View) => {
    setView(next);
    setMenu(false);
  };
  const t = userUi(locale);
  const navLabels = t.app.nav;
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <div className="sidebar-head">
          <Logo />
          <button
            className="icon-button mobile-only"
            aria-label={t.app.closeNavigation}
            onClick={() => setMenu(false)}
          >
            <X size={20} />
          </button>
        </div>
        <nav>
          {nav.map(([id, Icon]) => (
            <button
              key={id}
              className={view === id ? "active" : ""}
              onClick={() => go(id)}
            >
              <Icon size={19} />
              <span>{navLabels[id]}</span>
              {id === "notifications" &&
                data.notifications.some(
                  (notification) => !notification.read,
                ) && (
                  <i>
                    {
                      data.notifications.filter(
                        (notification) => !notification.read,
                      ).length
                    }
                  </i>
                )}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          {data.user.adminRole && <Link href="/admin">
            <ShieldCheck size={18} />
            Admin
          </Link>}
          <form action={logoutAction}>
            <button type="submit">
              <LogOut size={18} />
              {t.app.signOut}
            </button>
          </form>
        </div>
      </aside>
      {menu && <button className="scrim" aria-label={t.app.closeNavigation} onClick={() => setMenu(false)} />}
      <main className="app-main">
        <header className="topbar">
          <div className="mobile-brand">
            <Logo tone="dark" />
          </div>
          <b className="desktop-title">
            {navLabels[view]}
          </b>
          <div className="top-actions">
            <label className="locale">
              <Globe2 size={16} />
              <select
                aria-label={t.app.language}
                value={locale}
                onChange={(e) => { const next = e.target.value as Locale; setLocale(next); startTransition(() => void savePreferencesAction({ locale: next, displayCurrency })); }}
              >
                {SUPPORTED_LOCALES.map((value) => <option value={value} key={value}>{value.toUpperCase()}</option>)}
              </select>
            </label>
            <button
              className="icon-button"
              aria-label={t.app.settingsView.theme}
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              {theme === "light" ? <Moon size={19} /> : <Sun size={19} />}
            </button>
            <button
              className="icon-button has-dot"
              aria-label={t.app.nav.notifications}
              onClick={() => go("notifications")}
            >
              <Bell size={19} />
            </button>
            <button className="avatar" aria-label={t.app.nav.profile} onClick={() => go("profile")}>
              <UserAvatar user={data.user} />
            </button>
          </div>
        </header>
        <div className="page-wrap">
          <Content view={view} go={go} data={data} locale={locale} displayCurrency={displayCurrency} setDisplayCurrency={setDisplayCurrency} />
        </div>
      </main>
      <nav className="bottom-nav">
        {nav.slice(0, 4).map(([id, Icon]) => (
          <button
            key={id}
            className={view === id ? "active" : ""}
            onClick={() => go(id)}
          >
            <Icon size={21} />
            <span>{navLabels[id]}</span>
          </button>
        ))}
        <button aria-label={t.app.menu} onClick={() => setMenu(true)}>
          <Menu size={21} />
          <span>{t.app.menu}</span>
        </button>
      </nav>
    </div>
  );
}
function Content({
  view,
  go,
  data,
  locale,
  displayCurrency,
  setDisplayCurrency,
}: {
  view: View;
  go: (view: View) => void;
  data: Workspace;
  locale: Locale;
  displayCurrency: Currency;
  setDisplayCurrency: (currency: Currency) => void;
}) {
  if (view === "home") return <Dashboard data={data} locale={locale} go={go} displayCurrency={displayCurrency} />;
  if (view === "accounts") return <Accounts data={data} locale={locale} />;
  if (view === "transactions")
    return <Transactions data={data} locale={locale} />;
  if (view === "cards") return <Cards data={data} locale={locale} onGoProfile={() => go("profile")} />;
  if (view === "notifications") return <Notifications data={data} locale={locale} />;
  if (view === "security") return <Security data={data} locale={locale} />;
  if (view === "profile") return <Profile user={data.user} profile={data.profile} locale={locale} />;
  return <SettingsView locale={locale} displayCurrency={displayCurrency} onDisplayCurrencyChange={setDisplayCurrency} accounts={data.accounts} currencyChangeRequests={data.currencyChangeRequests} transactionPinConfigured={data.transactionPinConfigured} />;
}

function Heading({
  overline,
  title,
  text,
  action,
}: {
  overline: string;
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <section className="heading">
      <div>
        <span className="eyebrow">{overline}</span>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
      {action}
    </section>
  );
}
function Dashboard({
  data,
  locale,
  go,
  displayCurrency,
}: {
  data: Workspace;
  locale: Locale;
  go: (view: View) => void;
  displayCurrency: Currency;
}) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(localStorage.getItem("Citizavrexo-balance-hidden") !== "true"));
    return () => cancelAnimationFrame(frame);
  }, []);
  const preferredAccount = data.accounts.find((item) => item.currency === displayCurrency);
  const account = preferredAccount ?? data.accounts[0];
  const t = userUi(locale).app;
  const accountCards = data.cards.filter((card) => card.accountId === account.id);
  const spending = accountCards.reduce((sum, card) => sum + card.monthlySpent, 0);
  const limit = accountCards.reduce((sum, card) => sum + card.monthlyLimit, 0);
  return (
    <>
      <Heading
        overline={new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date()).toUpperCase()}
        title={`${t.greeting}, ${data.user.name.split(" ")[0]}`}
        text={t.overview}
      />
      <div className="dashboard-grid">
        <section className="balance-card">
          <div className="balance-top">
            <span>
              {preferredAccount ? `${t.totalBalance} · ${displayCurrency}` : `${t.dashboard.availableBalance} · ${account.currency}`} {" "}
              <button aria-label={visible ? t.dashboard.hideBalance : t.dashboard.showBalance} onClick={() => { const next = !visible; setVisible(next); localStorage.setItem("Citizavrexo-balance-hidden", String(!next)); }}>
                {visible ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            </span>
            <Status value={account.status} locale={locale} />
          </div>
          <strong>
            {visible
              ? money(account.balance, account.currency, locale)
              : "••••••••"}
          </strong>
          {!preferredAccount && <p className="note">{t.dashboard.noExchangeRate.replace("{currency}", displayCurrency).replace("{ledgerCurrency}", account.currency)}</p>}
          <div className="account-meta">
            <span>
              <small>{t.dashboard.accountNumber}</small>
              <b>{account.number} <CopyAccountNumber value={account.number} locale={locale}/></b>
            </span>
            <span>
              <small>{t.dashboard.accountType}</small>
              <b>{localizeAccountName(locale, account.name)}</b>
            </span>
          </div>
        </section>
        <section className="panel snapshot">
          <span className="eyebrow">{t.dashboard.thisMonth}</span>
          <h2>{t.dashboard.spendingSnapshot}</h2>
          <strong>{money(spending, account.currency, locale)}</strong>
          <div className="progress">
            <i style={{ width: `${limit ? Math.min(100, spending / limit * 100) : 0}%` }} />
          </div>
          <p>
            <span>{t.dashboard.monthlyLimit}</span>
            <b>{money(limit, account.currency, locale)}</b>
          </p>
        </section>
      </div>
      <MoneyWorkflowButtons accounts={data.accounts} destinations={data.bankDestinations} withdrawals={data.withdrawalRequests} customerService={data.customerService} locale={locale} onHistory={() => go("transactions")}/>
      <div className="content-grid">
        <section className="panel">
          <div className="panel-title">
            <div>
              <span className="eyebrow">{t.dashboard.latestActivity}</span>
              <h2>{t.recentTransactions}</h2>
            </div>
            <button className="text-button" onClick={() => go("transactions")}>
              {t.dashboard.seeAll} <ArrowRight size={16} />
            </button>
          </div>
          <TransactionList
            items={data.transactions.slice(0, 4)}
            locale={locale}
          />
        </section>
        <section className="panel account-list">
          <div className="panel-title">
            <div>
              <span className="eyebrow">{t.dashboard.yourMoney}</span>
              <h2>{t.nav.accounts}</h2>
            </div>
          </div>
          {data.accounts.map((a) => (
            <button key={a.id} onClick={() => go("accounts")}>
              <span className="round-icon">
                <Landmark size={19} />
              </span>
              <span>
                <b>{localizeAccountName(locale, a.name)}</b>
                <small>•• {a.number.slice(-4)}</small>
              </span>
              <strong>{money(a.balance, a.currency, locale)}</strong>
            </button>
          ))}
        </section>
      </div>
    </>
  );
}
function TransactionList({
  items,
  locale,
}: {
  items: Transaction[];
  locale: Locale;
}) {
  return (
    <div className="transaction-list">
      {items.map((item) => (
        <div className="transaction-row" key={item.id}>
          <span
            className={`round-icon ${item.amount > 0 ? "incoming" : "outgoing"}`}
          >
            {item.amount > 0 ? (
              <ArrowDownLeft size={19} />
            ) : (
              <ArrowUpRight size={19} />
            )}
          </span>
          <span>
            <b>{localizeTransactionDescription(locale, item.description)}</b>
            <small>{when(item.occurredAt, locale)}</small>
          </span>
          <span className="amount">
            <b className={item.amount > 0 ? "positive" : ""}>
              {item.amount > 0 ? "+" : "-"}
              {money(item.amount, item.currency, locale)}
            </b>
            <Status value={item.status} locale={locale} />
          </span>
        </div>
      ))}
    </div>
  );
}
function Accounts({ data, locale }: { data: Workspace; locale: Locale }) {
  const t = userUi(locale).app;
  const [selected, setSelected] = useState(data.accounts[0]);
  return (
    <>
      <Heading
        overline={t.dashboard.yourMoney}
        title={t.accountsView.title}
        text={t.accountsView.subtitle}
        action={
          <button className="button primary" disabled title={t.accountsView.openAccountUnavailable}>
            <Landmark size={18} />
            {t.accountsView.openAccount}
          </button>
        }
      />
      <div className="account-layout">
        <div className="account-cards">
          {data.accounts.map((a) => (
            <button
              className={selected.id === a.id ? "selected" : ""}
              onClick={() => setSelected(a)}
              key={a.id}
            >
              <span>
                <WalletCards size={20} />
                <Status value={a.status} locale={locale} />
              </span>
              <small>{localizeAccountName(locale, a.name)}</small>
              <strong>{money(a.balance, a.currency, locale)}</strong>
              <em>{a.number}</em>
            </button>
          ))}
        </div>
        <section className="panel details">
          <div className="panel-title">
            <div>
              <span className="eyebrow">{t.accountsView.accountOverview}</span>
              <h2>{localizeAccountName(locale, selected.name)}</h2>
            </div>
            <span className="note">{t.readOnly}</span>
          </div>
          <dl>
            <div>
              <dt>{t.dashboard.accountNumber}</dt>
              <dd>{selected.number} <CopyAccountNumber value={selected.number} locale={locale}/></dd>
            </div>
            <div>
              <dt>{t.accountsView.currency}</dt>
              <dd>{selected.currency}</dd>
            </div>
            <div>
              <dt>{t.dashboard.accountType}</dt>
              <dd>{t.accountTypes[selected.type]}</dd>
            </div>
            <div>
              <dt>{t.accountsView.status}</dt>
              <dd>
                <Status value={selected.status} locale={locale} />
              </dd>
            </div>
          </dl>
          <MoneyWorkflowButtons accounts={[selected]} destinations={data.bankDestinations} withdrawals={data.withdrawalRequests.filter((request) => request.accountId === selected.id)} customerService={data.customerService} locale={locale} compact/>
          <h3>{t.accountsView.recentActivity}</h3>
          <TransactionList
            items={data.transactions.filter((t) => t.accountId === selected.id)}
            locale={locale}
          />
        </section>
      </div>
    </>
  );
}
function Transactions({ data, locale }: { data: Workspace; locale: Locale }) {
  const t = userUi(locale).app;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<Transaction | null>(null);
  const items = useMemo(
    () =>
      data.transactions.filter(
        (t) =>
          (localizeTransactionDescription(locale, t.description) + t.reference)
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (status === "all" || t.status === status),
      ),
    [data.transactions, query, status, locale],
  );
  return (
    <>
      <Heading
        overline={t.transactionsView.overline}
        title={t.transactionsView.title}
        text={t.transactionsView.subtitle}
        action={
          <button className="button secondary" onClick={() => downloadTransactions(items, locale)} disabled={!items.length}>
            <ArrowDownLeft size={18} />
            {t.transactionsView.export}
          </button>
        }
      />
      <section className="panel table-panel">
        <div className="filters">
          <label className="search">
            <Search size={18} />
            <input
              aria-label={t.transactionsView.searchAria}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.transactionsView.searchPlaceholder}
            />
          </label>
          <label className="select">
            <SlidersHorizontal size={17} />
            <select aria-label={t.transactionsView.filterAria} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">{t.transactionsView.allStatuses}</option>
              <option value="completed">{t.statuses.completed}</option>
              <option value="pending">{t.statuses.pending}</option>
              <option value="reversed">{t.statuses.reversed}</option>
              <option value="failed">{t.statuses.failed}</option>
              <option value="cancelled">{t.statuses.cancelled}</option>
            </select>
          </label>
        </div>
        <div className="data-table">
          <div className="table-row table-head">
            <span>{t.transactionsView.tableTransaction}</span>
            <span>{t.transactionsView.tableReference}</span>
            <span>{t.transactionsView.tableDate}</span>
            <span>{t.transactionsView.tableStatus}</span>
            <span>{t.transactionsView.tableAmount}</span>
          </div>
          {items.map((item) => (
            <button className="table-row" key={item.id} onClick={() => setSelected(item)} aria-label={`${t.transactionsView.viewTransaction} ${item.reference}`}>
              <span>
                <b>{localizeTransactionDescription(locale, item.description)}</b>
                <small>{localizeTransactionType(locale, item.type)}</small>
              </span>
              <span>{item.reference}</span>
              <span>{when(item.occurredAt, locale)}</span>
              <span>
                <Status value={item.status} locale={locale} />
              </span>
              <span className={item.amount > 0 ? "positive" : ""}>
                {item.amount > 0 ? "+" : "-"}
                {money(item.amount, item.currency, locale)}
              </span>
            </button>
          ))}
        </div>
        {!items.length && <div className="empty-state"><Search size={24}/><p>{t.transactionsView.noMatches}</p></div>}
      </section>
      {selected && <section className="panel transaction-detail"><div className="panel-title"><div><span className="eyebrow">{t.transactionsView.detailOverline}</span><h2>{localizeTransactionDescription(locale, selected.description)}</h2></div><button className="icon-button" aria-label={t.transactionsView.closeDetails} onClick={() => setSelected(null)}><X size={18}/></button></div>{selected.transferDetails ? <TransferReceiptCard locale={locale} receipt={{ reference: selected.transferDetails.baseReference, occurredAt: selected.occurredAt, amount: Math.abs(selected.amount), currency: selected.currency, sourceAmount: selected.transferDetails.sourceAmount, sourceCurrency: selected.transferDetails.sourceCurrency, recipientAmount: selected.transferDetails.recipientAmount, recipientCurrency: selected.transferDetails.recipientCurrency, exchangeRate: selected.transferDetails.exchangeRate, rateDate: selected.transferDetails.rateDate, rateTimestamp: selected.transferDetails.rateTimestamp, rateProvider: selected.transferDetails.rateProvider, status: "completed", senderName: selected.transferDetails.senderName, senderAccountName: selected.transferDetails.direction === "sent" ? selected.transferDetails.accountName : selected.transferDetails.counterpartyAccountName, senderAccountNumber: selected.transferDetails.direction === "sent" ? selected.transferDetails.accountNumber : selected.transferDetails.counterpartyAccountNumber, recipientName: selected.transferDetails.recipientName, recipientAccountName: selected.transferDetails.direction === "received" ? selected.transferDetails.accountName : selected.transferDetails.counterpartyAccountName, recipientAccountNumber: selected.transferDetails.direction === "received" ? selected.transferDetails.accountNumber : selected.transferDetails.counterpartyAccountNumber }}/>: <dl><div><dt>{t.transactionsView.tableReference}</dt><dd>{selected.reference}</dd></div><div><dt>{t.account}</dt><dd>{(() => { const accountName = data.accounts.find((account) => account.id === selected.accountId)?.name; return accountName ? localizeAccountName(locale, accountName) : selected.accountId; })()}</dd></div><div><dt>{t.transactionsView.tableDate}</dt><dd>{when(selected.occurredAt, locale)}</dd></div><div><dt>{t.transactionsView.tableStatus}</dt><dd><Status value={selected.status} locale={locale}/></dd></div><div><dt>{t.transactionsView.balanceBefore}</dt><dd>{money(selected.balanceBefore, selected.currency, locale)}</dd></div><div><dt>{t.transactionsView.balanceAfter}</dt><dd>{money(selected.balanceAfter, selected.currency, locale)}</dd></div></dl>}</section>}
    </>
  );
}
function Cards({ data, locale, onGoProfile }: { data: Workspace; locale: Locale; onGoProfile: () => void }) {
  const t = userUi(locale).app;
  const [items, setItems] = useState(data.cards);
  const [id, setId] = useState(items[0]?.id ?? "");
  const card = items.find((c) => c.id === id);
  const cardCurrency = data.accounts.find((account) => account.id === card?.accountId)?.currency ?? "USD";
  const freeze = () => {
    if (!card) return;
    const previousStatus = card.status;
    const optimisticStatus = previousStatus === "frozen" ? "active" : "frozen";
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, status: optimisticStatus } : item,
      ),
    );
    startTransition(async () => {
      try {
        const persistedStatus = await toggleCardFreeze(id);
        setItems((current) =>
          current.map((item) =>
            item.id === id
              ? { ...item, status: persistedStatus ?? previousStatus }
              : item,
          ),
        );
      } catch {
        setItems((current) =>
          current.map((item) =>
            item.id === id ? { ...item, status: previousStatus } : item,
          ),
        );
      }
    });
  };
  const toggleCapability = (capability: "onlinePayments" | "contactlessPayments") => {
    if (!card) return;
    const previous = card[capability];
    setItems((current) => current.map((item) => item.id === id ? { ...item, [capability]: !previous } : item));
    startTransition(async () => {
      try {
        const persisted = await toggleCardCapability(id, capability);
        setItems((current) => current.map((item) => item.id === id ? { ...item, [capability]: persisted ?? previous } : item));
      } catch {
        setItems((current) => current.map((item) => item.id === id ? { ...item, [capability]: previous } : item));
      }
    });
  };
  return (
    <>
      <Heading
        overline={t.cardsView.overline}
        title={t.cardsView.title}
        text={t.cardsView.subtitle}
      />
      <CardRequestPanel accounts={data.accounts} requests={data.cardRequests} profile={data.profile} locale={locale} onGoProfile={onGoProfile}/>
      <div className="cards-layout">
        <div>
          {items.map((c) => (
            <button
              className={`Citizavrexo-card ${c.status === "frozen" ? "frozen" : ""}`}
              onClick={() => setId(c.id)}
              key={c.id}
            >
              <Logo />
              <span className="chip" />
              <strong>•••• &nbsp;•••• &nbsp;•••• &nbsp;{c.lastFour}</strong>
              <div>
                <span>
                  <small>{t.cardsView.cardHolder}</small>
                  {data.user.name.toUpperCase()}
                </span>
                <span>
                  <small>{t.cardsView.expires}</small>
                  {c.expires}
                </span>
              </div>
            </button>
          ))}
          {!items.length && <section className="panel empty-state"><CreditCard size={26}/><h2>{t.cardsView.noCardsTitle}</h2><p>{t.cardsView.noCardsSubtitle}</p></section>}
        </div>
        {card && <section className="panel card-controls">
          <div className="panel-title">
            <div>
              <span className="eyebrow">{t.cardsView.controls}</span>
              <h2>{card.label}</h2>
            </div>
            <Status value={card.status} locale={locale} />
          </div>
          <button className="control" onClick={freeze}>
            <span className="round-icon">
              <Snowflake size={19} />
            </span>
            <span>
              <b>
                {card.status === "frozen" ? t.cardsView.unfreezeCard : t.cardsView.freezeCard}
              </b>
              <small>{t.cardsView.pauseCard}</small>
            </span>
            <span className={`toggle ${card.status === "frozen" ? "on" : ""}`}>
              <i />
            </span>
          </button>
          <button className="control" onClick={() => toggleCapability("onlinePayments")} disabled={card.status === "expired"}>
            <span className="round-icon">
              <Globe2 size={19} />
            </span>
            <span>
              <b>{t.cardsView.onlinePayments}</b>
              <small>{t.cardsView.onlinePaymentsHelp}</small>
            </span>
            <span className={`toggle ${card.onlinePayments ? "on" : ""}`}>
              <i />
            </span>
          </button>
          <button className="control" onClick={() => toggleCapability("contactlessPayments")} disabled={card.status === "expired"}>
            <span className="round-icon"><Activity size={19}/></span><span><b>{t.cardsView.contactlessPayments}</b><small>{t.cardsView.contactlessPaymentsHelp}</small></span><span className={`toggle ${card.contactlessPayments ? "on" : ""}`}><i/></span>
          </button>
          <div className="control">
            <span className="round-icon">
              <Activity size={19} />
            </span>
            <span>
              <b>{t.cardsView.monthlySpending}</b>
              <small>
                {money(card.monthlySpent, cardCurrency, locale)} {t.cardsView.of}{" "}
                {money(card.monthlyLimit, cardCurrency, locale)}
              </small>
            </span>
          </div>
          <div className="progress">
            <i
              style={{
                width: `${(card.monthlySpent / card.monthlyLimit) * 100}%`,
              }}
            />
          </div>
        </section>}
      </div>
    </>
  );
}
function Notifications({ data, locale }: { data: Workspace; locale: Locale }) {
  const t = userUi(locale).app;
  const [items, setItems] = useState(data.notifications);
  const markAll = () => {
    setItems(items.map((n) => ({ ...n, read: true })));
    startTransition(() => void markAllNotificationsRead());
  };
  return (
    <>
      <Heading
        overline={t.notifications}
        title={t.nav.notifications}
        text={t.notifications}
        action={
          <button className="button secondary" onClick={markAll}>
            <Check size={18} />
            {t.markAllAsRead}
          </button>
        }
      />
      <section className="panel notification-list">
        {items.map((n) => (
          (() => {
            const localized = localizeNotification(locale, n);
            const NotificationIcon = n.kind === "security" ? ShieldCheck : n.kind === "credit" ? ArrowDownLeft : n.kind === "transfer" || n.kind === "debit" ? ArrowUpRight : n.title.toLowerCase().includes("card") ? CreditCard : Bell;
            return (
          <button
            className={!n.read ? "unread" : ""}
            key={n.id}
            onClick={() => {
              setItems(
                items.map((item) =>
                  item.id === n.id ? { ...item, read: true } : item,
                ),
              );
              startTransition(() => void markNotificationRead(n.id));
            }}
          >
            <span className={`round-icon notification-icon notification-${n.kind}`}>
              <NotificationIcon size={19} />
            </span>
            <span>
              <b>
                {localized.title}
                {n.important && <i>{userUi(locale).app.important}</i>}
              </b>
              <small>{localized.message}</small>
              <em>
                {when(n.createdAt, locale)}
                {n.eventReference && ` · ${n.eventReference}`}
              </em>
            </span>
            {!n.read && <i className="dot" />}
          </button>
            );
          })()
        ))}
        {!items.length && <div className="empty-state"><Bell size={24}/><p>{t.noNotifications}</p></div>}
      </section>
    </>
  );
}
function Security({ data, locale }: { data: Workspace; locale: Locale }) {
  const t = userUi(locale).app;
  const [recoveryState, recoveryAction, pending] = useActionState(
    generateRecoveryCodesAction,
    { codes: [], error: null },
  );
  return (
    <>
      <Heading
        overline={t.securityView.overline}
        title={t.securityView.title}
        text={t.securityView.subtitle}
        action={
          <form action={logoutAllDevicesAction}>
            <button className="button danger">
              <LogOut size={18} />
              {t.securityView.logoutAllDevices}
            </button>
          </form>
        }
      />
      <div className="security-grid">
        <section className="panel">
          <div className="panel-title">
            <div>
              <span className="eyebrow">{t.securityView.signInSecurity}</span>
              <h2>{t.securityView.securityMethods}</h2>
            </div>
            <ShieldCheck size={21} />
          </div>
          {[
            {
              Icon: LockKeyhole,
              title: t.securityView.passwordMethod,
              text: t.securityView.passwordMethodHelp,
            },
            { Icon: Fingerprint, title: t.securityView.transactionPin, text: data.transactionPinConfigured ? "Configured" : t.securityView.notConfigured, editable: true },
            {
              Icon: Smartphone,
              title: t.securityView.twoStepVerification,
              text: data.user.emailVerified ? t.securityView.emailVerified : t.securityView.emailNotVerified,
            },
          ].map(({ Icon, title, text, editable }) => (
            <div className="control" key={title}>
              <span className="round-icon">
                <Icon size={19} />
              </span>
              <span>
                <b>{title}</b>
                <small>{text}</small>
              </span>
              {!editable && <span className="note">{t.readOnly}</span>}
            </div>
          ))}
          <TransactionPinPanel configured={data.transactionPinConfigured} />
          <form action={recoveryAction}>
            <button className="button secondary full" disabled={pending}>
              <LockKeyhole size={18} />
              {pending ? t.securityView.generating : t.securityView.generateRecoveryCodes}
            </button>
          </form>
          {recoveryState.codes.length > 0 && (
            <div className="recovery-code-list" role="status">
              <b>{t.securityView.storeCodes}</b>
              <ul>
                {recoveryState.codes.map((code) => (
                  <li key={code}>{code}</li>
                ))}
              </ul>
            </div>
          )}
          {recoveryState.error && (
            <p className="auth-message error" role="alert">
              {localizeUserActionMessage(locale, recoveryState.error)}
            </p>
          )}
          <p className="note">
            {t.securityView.recoveryCodesNote}
          </p>
        </section>
        <section className="panel">
          <div className="panel-title">
            <div>
              <span className="eyebrow">{t.securityView.authorizedAccess}</span>
              <h2>{t.securityView.devices}</h2>
            </div>
            <Laptop size={21} />
          </div>
          {data.devices.map((d) => (
            <Device device={d} locale={locale} key={d.id} />
          ))}
          {!data.devices.length && <div className="empty-state"><Laptop size={24}/><p>{t.securityView.noDevices}</p></div>}
        </section>
      </div>
    </>
  );
}
function Device({ device, locale }: { device: AuthorizedDevice; locale: Locale }) {
  const t = userUi(locale).app;
  return (
    <div className="device">
      <span className="round-icon">
        {device.name.includes("iPhone") ? (
          <Smartphone size={19} />
        ) : (
          <Laptop size={19} />
        )}
      </span>
      <span>
        <b>
          {device.name}
          {device.current && <i>{t.securityView.current}</i>}
        </b>
        <small>
          {device.browser} · {device.location}
        </small>
        <em>{t.securityView.lastActive} {when(device.lastActiveAt, locale)}</em>
      </span>
      {!device.current && (
        <button
          className="text-button"
          onClick={() => startTransition(() => void revokeDevice(device.id))}
        >
          {t.securityView.remove}
        </button>
      )}
    </div>
  );
}
function Profile({ user, profile, locale }: { user: User; profile: UserProfile; locale: Locale }) {
  const [state, action, pending] = useActionState(uploadProfileImageAction, {});
  const [preview, setPreview] = useState<string>();
  const text = userUi(locale).accountFeature;
  const p = userUi(locale).app.profileView;
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  return (
    <>
      <Heading
        overline={p.overline}
        title={p.title}
        text={p.subtitle}
      />
      <section className="panel profile">
        <div className="profile-head">
          <span className="large-avatar"><UserAvatar user={user} imageUrl={preview} /></span>
          <div>
            <h2>{user.name}</h2>
            <p>{user.email}</p>
            <Status value={user.status} locale={locale} />
          </div>
          <form action={action} className="profile-photo-form">
            <label className="button secondary" htmlFor="profile-photo">{text.choosePhoto}</label>
            <input id="profile-photo" name="profileImage" type="file" accept="image/jpeg,image/png,image/webp" required onChange={(event) => { if (preview) URL.revokeObjectURL(preview); setPreview(event.target.files?.[0] ? URL.createObjectURL(event.target.files[0]) : undefined); }}/>
            <button className="button primary" disabled={pending || !preview}>{pending ? text.saving : text.savePhoto}</button>
          </form>
        </div>
        <div className="form-grid">
          <label>
            {p.fullName}
            <input value={user.name} readOnly />
          </label>
          <label>
            {p.emailAddress}
            <input value={user.email} readOnly />
          </label>
          <label>
            {p.emailVerification}
            <input value={user.emailVerified ? p.verified : p.notVerified} readOnly />
          </label>
          <label>
            {p.memberSince}
            <input value={new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(user.createdAt))} readOnly />
          </label>
        </div>
        {state.error && <p className="auth-message error" role="alert">{localizeUserActionMessage(locale, state.error)}</p>}
        {state.success && <p className="auth-message success" role="status">{localizeUserActionMessage(locale, state.success)}</p>}
        <p className="note">{text.photoNote}</p>
      </section>
      <ProfileCompletionForm profile={profile} locale={locale}/>
    </>
  );
}
function UserAvatar({ user, imageUrl }: { user: User; imageUrl?: string }) {
  const source = imageUrl ?? user.profileImageUrl;
  return source ? <span className="avatar-image" role="img" aria-label={user.name} style={{ backgroundImage: `url(${JSON.stringify(source)})` }} /> : <>{user.avatarInitials}</>;
}

function CopyAccountNumber({ value, locale }: { value: string; locale: Locale }) {
  const [copied, setCopied] = useState(false);
  const text = userUi(locale).accountFeature;
  return <button className="copy-button" type="button" aria-label={copied ? text.accountCopied : text.copyAccount} title={copied ? text.copied : text.copyAccount} onClick={() => { void navigator.clipboard.writeText(value).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1600); }); }}>{copied ? <Check size={14}/> : <Copy size={14}/>}</button>;
}
function SettingsView({ locale, displayCurrency, onDisplayCurrencyChange, accounts, currencyChangeRequests, transactionPinConfigured }: { locale: Locale; displayCurrency: Currency; onDisplayCurrencyChange: (currency: Currency) => void; accounts: Account[]; currencyChangeRequests: CurrencyChangeRequest[]; transactionPinConfigured: boolean }) {
  const t = userUi(locale).app;
  return (
    <>
      <Heading
        overline={t.preferences}
        title={t.settings}
        text={t.settingsView.headingText}
      />
      <div className="settings-grid">
        <section className="panel">
          <div className="panel-title">
            <div>
              <span className="eyebrow">{t.settingsView.experience}</span>
              <h2>{t.settingsView.appearanceLanguage}</h2>
            </div>
            <SlidersHorizontal size={20} />
          </div>
          <div className="control">
            <span className="round-icon">
              <Languages size={19} />
            </span>
            <span>
              <b>{t.language}</b>
              <small>{localeNames[locale]}</small>
            </span>
          </div>
          <label className="control"><span className="round-icon"><WalletCards size={19}/></span><span><b>{t.settingsView.displayCurrency}</b><small>{t.settingsView.displayCurrencyHelp}</small></span><select value={displayCurrency} onChange={(event) => { const next = event.target.value as Currency; onDisplayCurrencyChange(next); startTransition(() => void savePreferencesAction({ locale, displayCurrency: next })); }}>{SUPPORTED_CURRENCIES.map((currency) => <option value={currency} key={currency}>{currency} · {currencyConfig[currency].name}</option>)}</select></label>
          <div className="control">
            <span className="round-icon">
              <Moon size={19} />
            </span>
            <span>
              <b>{t.settingsView.theme}</b>
              <small>{t.settingsView.useTopNavigationControl}</small>
            </span>
          </div>
        </section>
        <section className="panel transaction-pin-settings">
          <div className="panel-title">
            <div>
              <span className="eyebrow">TRANSFER SECURITY</span>
              <h2>{t.securityView.transactionPin}</h2>
              <p className="note">{transactionPinConfigured ? "Change the 4-digit PIN required to authorize transfers." : "Create the 4-digit PIN required to authorize transfers."}</p>
            </div>
            <span className={`status status-${transactionPinConfigured ? "active" : "pending"}`}>{transactionPinConfigured ? "Configured" : t.securityView.notConfigured}</span>
          </div>
          <TransactionPinPanel configured={transactionPinConfigured} />
        </section>
        <CurrencyChangePanel accounts={accounts} requests={currencyChangeRequests}/>
        <section className="panel">
          <div className="panel-title">
            <div>
              <span className="eyebrow">{t.settingsView.communication}</span>
              <h2>{t.settingsView.notificationPreferences}</h2>
            </div>
            <Bell size={20} />
          </div>
          {[t.settingsView.transactionUpdates, t.settingsView.securityAlerts, t.settingsView.accountNotices, t.settingsView.emailNotifications].map((label) => (
            <div className="control" key={label}>
              <span>
                <b>{label}</b>
                <small>{t.settingsView.managedByPolicy}</small>
              </span>
              <span className="note">{t.readOnly}</span>
            </div>
          ))}
        </section>
        <section className="panel help">
          <CircleHelp size={24} />
          <div>
            <h2>{t.helpSupport}</h2>
            <p>{t.settingsView.helpNotConfigured}</p>
          </div>
          <button className="button secondary" disabled>{t.helpUnavailable}</button>
        </section>
      </div>
    </>
  );
}

