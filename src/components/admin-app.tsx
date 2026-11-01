"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowDownLeft, Bell, ChevronDown, CircleUserRound, CreditCard, Download, Eye, FileChartColumn,
  Landmark, LayoutDashboard, Mail, Menu, Search, Settings, ShieldCheck, UserRoundSearch, Users,
  X, Moon, Sun,
} from "lucide-react";
import { logoutAction } from "@/app/auth-actions";
import { AdministratorTransferPanel } from "@/components/administrator-transfer-panel";
import { AdminCardRequests } from "@/components/admin-card-requests";
import { AdminProfileReviews } from "@/components/admin-profile-reviews";
import { AdminWithdrawalRequests } from "@/components/admin-withdrawal-requests";
import { AdminCurrencyChangeRequests } from "@/components/admin-currency-change-requests";
import { DeleteUserDialog } from "@/components/delete-user-dialog";
import { CreditAccountDialog, UserStatusDialog } from "@/components/admin-customer-controls";
import type { Account, AdminMessage, AdminRole, AuditEvent, CardRequest, CurrencyChangeRequest, ManagedCard, RecoveryRequest, Transaction, User, UserProfile, WithdrawalRequest } from "@/lib/domain";
import type { Permission } from "@/lib/auth/permissions";
import { formatCurrencyAmount } from "@/lib/currency";
import { AdminMessagePanel } from "@/components/admin-message-panel";
import { BrandLogo } from "@/components/brand-logo";

type AdminNotification = { id: string; userId: string; kind: string; title: string; message: string; createdAt: string; read: boolean; important: boolean; eventReference?: string };
type ReviewProfile = UserProfile & { userId: string; userName: string; userEmail: string; updatedAt: string };
type Data = { users: User[]; accounts: Account[]; transactions: Transaction[]; cards: ManagedCard[]; cardRequests: CardRequest[]; profiles: ReviewProfile[]; withdrawalRequests: WithdrawalRequest[]; currencyChangeRequests: CurrencyChangeRequest[]; notifications: AdminNotification[]; adminMessages: AdminMessage[]; recoveryRequests: RecoveryRequest[]; auditEvents: AuditEvent[] };
type Identity = { id: string; name: string; role: AdminRole; permissions: Permission[] };
type View = "Dashboard" | "Users" | "Accounts" | "Transactions" | "Profile reviews" | "Card requests" | "Withdrawal requests" | "Currency requests" | "Notifications" | "Recovery" | "Security" | "Reports" | "Audit logs" | "Settings";

const nav: { label: View; icon: typeof LayoutDashboard; permission: Permission }[] = [
  { label: "Dashboard", icon: LayoutDashboard, permission: "admin.dashboard.read" },
  { label: "Users", icon: Users, permission: "users.read" },
  { label: "Accounts", icon: Landmark, permission: "accounts.read" },
  { label: "Transactions", icon: Activity, permission: "transactions.read" },
  { label: "Profile reviews", icon: UserRoundSearch, permission: "profiles.review" },
  { label: "Card requests", icon: CreditCard, permission: "cards.review" },
  { label: "Withdrawal requests", icon: ArrowDownLeft, permission: "withdrawals.review" },
  { label: "Currency requests", icon: Landmark, permission: "accounts.currency.review" },
  { label: "Notifications", icon: Bell, permission: "notifications.manage" },
  { label: "Recovery", icon: UserRoundSearch, permission: "recovery.read" },
  { label: "Security", icon: ShieldCheck, permission: "security.read" },
  { label: "Reports", icon: FileChartColumn, permission: "reports.read" },
  { label: "Audit logs", icon: Activity, permission: "audit.read" },
  { label: "Settings", icon: Settings, permission: "settings.manage" },
];

const money = (value: number, currency: string) => formatCurrencyAmount(value, currency, "en-US");
const dateTime = (value: string) => new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value));
const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

function downloadCsv(filename: string, headers: string[], rows: unknown[][]) {
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function AdminApp({ data, identity }: { data: Data; identity: Identity }) {
  const [view, setView] = useState<View>("Dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [themeReady, setThemeReady] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const stored = localStorage.getItem("Citizavrexo-theme") as "light" | "dark" | null;
      setTheme(stored ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
      setThemeReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => { if (themeReady) { document.documentElement.dataset.theme = theme; localStorage.setItem("Citizavrexo-theme", theme); } }, [theme, themeReady]);
  const availableNav = nav.filter((item) => identity.permissions.includes(item.permission));
  const initials = identity.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  function selectView(next: View) {
    setView(next);
    setQuery("");
    setStatus("all");
    setMenuOpen(false);
  }

  return <div className="app-shell admin-shell">
    <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
      <div className="sidebar-head"><Brand/><button className="mobile-only icon-button" aria-label="Close navigation" onClick={() => setMenuOpen(false)}><X size={18}/></button></div>
      <p className="admin-label">ADMIN CONSOLE</p>
      <nav>{availableNav.map(({ label, icon: Icon }) => <button key={label} className={view === label ? "active" : ""} onClick={() => selectView(label)}><Icon size={17}/>{label}</button>)}</nav>
      <div className="sidebar-foot"><form action={logoutAction}><button type="submit"><CircleUserRound size={17}/>Sign out</button></form></div>
    </aside>
    {menuOpen && <button className="scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)}/>}
    <main className="app-main">
      <header className="topbar">
        <button className="admin-menu icon-button" aria-label="Open navigation" onClick={() => setMenuOpen(true)}><Menu size={19}/></button>
        <b>{view}</b>
        <div className="top-actions"><button className="icon-button" aria-label={`Use ${theme === "light" ? "dark" : "light"} theme`} onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme === "light" ? <Moon size={18}/> : <Sun size={18}/>}</button><span className="status">{identity.role.replaceAll("_", " ")}</span><span className="avatar" aria-label={`Signed in as ${identity.name}`}>{initials}</span></div>
      </header>
      <div className="page-wrap">{view === "Dashboard" ? <Dashboard data={data}/> : <RecordsView view={view} data={data} identity={identity} query={query} setQuery={setQuery} status={status} setStatus={setStatus}/>}</div>
    </main>
  </div>;
}

function Brand() {
  return <div className="brand"><BrandLogo tone="light"/></div>;
}

function Dashboard({ data }: { data: Data }) {
  const completed = data.transactions.filter((row) => row.status === "completed");
  const pendingRecovery = data.recoveryRequests.filter((row) => row.status === "submitted" || row.status === "under_review" || row.status === "additional_verification_required").length;
  const metrics = [
    ["Users", data.users.length, Users], ["Accounts", data.accounts.length, Landmark], ["Managed cards", data.cards.length, CreditCard],
    ["Transactions", data.transactions.length, Activity], ["Pending cards", data.cardRequests.filter((request) => request.status === "pending").length, CreditCard], ["Pending withdrawals", data.withdrawalRequests.filter((request) => request.status === "pending").length, ArrowDownLeft], ["Open recovery", pendingRecovery, UserRoundSearch],
  ] as const;
  const dayMap = new Map<string, number>();
  completed.forEach((row) => { const day = row.occurredAt.slice(0, 10); dayMap.set(day, (dayMap.get(day) ?? 0) + 1); });
  const activity = [...dayMap.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-7);
  const peak = Math.max(1, ...activity.map(([, value]) => value));
  return <>
    <div className="heading"><div><span className="eyebrow">DATABASE OVERVIEW</span><h1>Administration</h1><p>Live read-only operational status for the records this role can access.</p></div></div>
    <section className="metrics">{metrics.map(([label, value, Icon]) => <article className="metric" key={label}><small>{label}</small><strong>{value}</strong><span className="round-icon"><Icon size={18}/></span><em>Current database</em></article>)}</section>
    <section className="admin-grid">
      <article className="panel chart-panel"><div className="panel-title"><div><span className="eyebrow">COMPLETED TRANSACTIONS</span><h2>Recent activity</h2></div></div>{activity.length ? <><div className="bars">{activity.map(([day, value]) => <i key={day} title={`${day}: ${value} completed`} style={{ height: `${Math.max(8, value / peak * 100)}%` }}/>)}</div><div className="chart-labels">{activity.map(([day]) => <span key={day}>{new Date(`${day}T00:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" })}</span>)}</div></> : <Empty text="No completed transaction activity is available."/>}</article>
      <article className="panel"><div className="panel-title"><div><span className="eyebrow">AUDIT TRAIL</span><h2>Recent events</h2></div></div>{data.auditEvents.slice(0, 5).map((row) => <div className="audit-item" key={row.id}><span className="round-icon"><Activity size={16}/></span><span><b>{row.action}</b><small>{row.actor} · {dateTime(row.timestamp)}</small></span><span className={`status status-${row.result}`}>{row.result}</span></div>)}{!data.auditEvents.length && <Empty text="Audit events are not available to this role."/>}</article>
    </section>
  </>;
}

function RecordsView({ view, data, identity, query, setQuery, status, setStatus }: { view: View; data: Data; identity: Identity; query: string; setQuery: (value: string) => void; status: string; setStatus: (value: string) => void }) {
  const normalized = query.trim().toLowerCase();
  const contains = (...values: unknown[]) => !normalized || values.some((value) => String(value ?? "").toLowerCase().includes(normalized));
  const users = data.users.filter((row) => contains(row.name, row.email, ...data.accounts.filter((account) => account.userId === row.id).map((account) => account.number)) && (status === "all" || row.status === status));
  const accounts = data.accounts.filter((row) => contains(row.name, row.number, row.currency, row.userId) && (status === "all" || row.status === status));
  const transactions = data.transactions.filter((row) => contains(row.description, row.reference, row.accountId) && (status === "all" || row.status === status));
  const notifications = data.notifications.filter((row) => contains(row.title, row.message, row.userId) && (status === "all" || (status === "read" ? row.read : !row.read)));
  const recovery = data.recoveryRequests.filter((row) => contains(row.id, row.userId, row.method) && (status === "all" || row.status === status));
  const audits = data.auditEvents.filter((row) => contains(row.actor, row.action, row.target) && (status === "all" || row.result === status));
  const exportConfig = useMemo(() => {
    if (view === "Users") return [["Name", "Email", "Status", "Verified", "Created"], users.map((r) => [r.name, r.email, r.status, r.emailVerified, r.createdAt])] as const;
    if (view === "Accounts") return [["Name", "Number", "Currency", "Balance", "Status", "Owner"], accounts.map((r) => [r.name, r.number, r.currency, r.balance, r.status, r.userId])] as const;
    if (view === "Transactions") return [["Reference", "Description", "Amount", "Currency", "Status", "Occurred"], transactions.map((r) => [r.reference, r.description, r.amount, r.currency, r.status, r.occurredAt])] as const;
    if (view === "Notifications") return [["Title", "Message", "User", "Read", "Created"], notifications.map((r) => [r.title, r.message, r.userId, r.read, r.createdAt])] as const;
    if (view === "Recovery") return [["ID", "User", "Method", "Risk", "Status", "Submitted"], recovery.map((r) => [r.id, r.userId, r.method, r.risk, r.status, r.submittedAt])] as const;
    if (view === "Audit logs") return [["Actor", "Action", "Target", "Result", "Timestamp"], audits.map((r) => [r.actor, r.action, r.target, r.result, r.timestamp])] as const;
    return null;
  }, [view, users, accounts, transactions, notifications, recovery, audits]);

    const statuses = view === "Users" ? ["active", "suspended", "pending"] : view === "Accounts" ? ["active", "restricted", "suspended", "closed"] : view === "Transactions" ? ["completed", "pending", "failed", "reversed", "cancelled"] : view === "Notifications" ? ["unread", "read"] : view === "Recovery" ? ["submitted", "under_review", "additional_verification_required", "approved", "rejected", "completed"] : view === "Audit logs" ? ["success", "denied", "failed"] : [];
  const table = view === "Users" ? <UserRows rows={users} data={data} canDelete={identity.permissions.includes("users.delete")} canSuspend={identity.permissions.includes("users.suspend")} canMessage={identity.permissions.includes("notifications.manage")} actorId={identity.id}/> : view === "Accounts" ? <AccountRows rows={accounts} users={data.users} canCredit={identity.permissions.includes("accounts.credit")}/> : view === "Transactions" ? <TransactionRows rows={transactions}/> : view === "Notifications" ? <NotificationRows rows={notifications}/> : view === "Recovery" ? <RecoveryRows rows={recovery}/> : view === "Audit logs" ? <AuditRows rows={audits}/> : null;

  if (view === "Card requests") return <AdminCardRequests requests={data.cardRequests} cards={data.cards}/>;
  if (view === "Profile reviews") return <AdminProfileReviews profiles={data.profiles}/>;
  if (view === "Withdrawal requests") return <AdminWithdrawalRequests requests={data.withdrawalRequests}/>;
  if (view === "Currency requests") return <AdminCurrencyChangeRequests requests={data.currencyChangeRequests}/>;
  if (view === "Security") return <InformationalView title="Security" text={`${data.cards.length} managed card records are visible. Security mutations remain in the authenticated user workspace; this console is read-only.`}/>;
  if (view === "Reports") return <InformationalView title="Reports" text={`Current records: ${data.users.length} users, ${data.accounts.length} accounts, and ${data.transactions.length} transactions. Use the relevant record view to export its current filtered dataset.`}/>;
  if (view === "Settings") return <AdministratorTransferPanel/>;

  return <><div className="heading"><div><span className="eyebrow">READ-ONLY RECORDS</span><h1>{view}</h1><p>Search and filter the database records available to your role.</p></div>{exportConfig && <button className="button secondary" onClick={() => downloadCsv(`Citizavrexo-${view.toLowerCase().replaceAll(" ", "-")}.csv`, [...exportConfig[0]], [...exportConfig[1]])}><Download size={16}/>Export CSV</button>}</div><section className="panel table-panel"><div className="filters"><label className="search"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label={`Search ${view}`} placeholder={`Search ${view.toLowerCase()}`}/></label>{statuses.length > 0 && <label className="select"><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label={`Filter ${view} by status`}><option value="all">All statuses</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={14}/></label>}</div>{table}</section></>;
}

function InformationalView({ title, text }: { title: string; text: string }) { return <><div className="heading"><div><span className="eyebrow">READ-ONLY</span><h1>{title}</h1></div></div><section className="panel admin-placeholder"><ShieldCheck size={34}/><h2>{title}</h2><p>{text}</p></section></>; }
function Empty({ text = "No matching records." }: { text?: string }) { return <div className="admin-placeholder"><Search size={28}/><p>{text}</p></div>; }
function UserRows({ rows, data, canDelete, canSuspend, canMessage, actorId }: { rows: User[]; data: Data; canDelete: boolean; canSuspend: boolean; canMessage: boolean; actorId: string }) {
  const [selected, setSelected] = useState<User | null>(null);
  const hasActions = canDelete || canSuspend;
  if (!rows.length) return <Empty/>;
  return <><div className={`data-table ${hasActions ? "user-table-actions" : ""}`}><div className="table-row table-head"><span>Customer</span><span>Account</span><span>Verification</span><span>Status</span><span>Actions</span></div>{rows.map((user) => { const account = data.accounts.find((item) => item.userId === user.id); return <div className="table-row" key={user.id}><span className="admin-user"><span className="avatar">{user.profileImageUrl ? <span className="avatar-image" role="img" aria-label={user.name} style={{ backgroundImage: `url(${JSON.stringify(user.profileImageUrl)})` }}/> : user.avatarInitials}</span><span><b>{user.name}</b><small>{user.email}</small></span></span><span><b>{account?.name ?? "No account"}</b><small>{account ? `Account ••••${account.number.slice(-4)}` : "Not available"}</small></span><span>{user.emailVerified ? "Email verified" : "Unverified"}</span><span className={`status status-${user.status}`}>{user.status}</span><span className="table-actions"><button className="icon-button" type="button" title="View customer" aria-label={`View ${user.name}`} onClick={() => setSelected(user)}><Eye size={17}/></button>{!user.adminRole && user.id !== actorId && canSuspend && <UserStatusDialog user={user}/>} {!user.adminRole && user.id !== actorId && canDelete && <DeleteUserDialog user={user}/>}</span></div>; })}</div>{selected && <UserOverview user={selected} data={data} canMessage={canMessage && !selected.adminRole} close={() => setSelected(null)}/>}</>;
}
function UserOverview({ user, data, canMessage, close }: { user: User; data: Data; canMessage: boolean; close: () => void }) {
  const [messaging, setMessaging] = useState(false);
  const ownedAccounts = data.accounts.filter((account) => account.userId === user.id);
  const accountIds = new Set(ownedAccounts.map((account) => account.id));
  const recentTransactions = data.transactions.filter((transaction) => accountIds.has(transaction.accountId)).slice(0, 4);
  const requests = data.withdrawalRequests.filter((request) => request.userId === user.id);
  const cardRequests = data.cardRequests.filter((request) => request.userId === user.id);
  const latest = [user.createdAt, ...recentTransactions.map((item) => item.occurredAt), ...requests.map((item) => item.submittedAt)].sort().at(-1) ?? user.createdAt;
  return <div className="modal-backdrop" role="presentation"><section className="modal admin-user-overview" role="dialog" aria-modal="true" aria-labelledby={messaging ? "admin-message-title" : "user-overview-title"}>{messaging ? <AdminMessagePanel user={user} messages={data.adminMessages.filter((item) => item.recipientUserId === user.id)} close={() => setMessaging(false)}/> : <><div className="panel-title"><div className="admin-user"><span className="avatar overview-avatar">{user.profileImageUrl ? <span className="avatar-image" role="img" aria-label={user.name} style={{ backgroundImage: `url(${JSON.stringify(user.profileImageUrl)})` }}/> : user.avatarInitials}</span><span><span className="eyebrow">CUSTOMER OVERVIEW</span><h2 id="user-overview-title">{user.name}</h2><small>{user.email}</small></span></div><button className="icon-button" type="button" aria-label="Close customer overview" onClick={close}><X size={18}/></button></div><dl className="review-details"><div><dt>Status</dt><dd><span className={`status status-${user.status}`}>{user.status}</span></dd></div><div><dt>Created</dt><dd>{dateTime(user.createdAt)}</dd></div><div><dt>Last relevant activity</dt><dd>{dateTime(latest)}</dd></div><div><dt>Security</dt><dd>{user.emailVerified ? "Email verified" : "Email unverified"}</dd></div><div><dt>Accounts</dt><dd>{ownedAccounts.length || "None"}</dd></div><div><dt>Card status</dt><dd>{cardRequests[0]?.status ?? "No request"}</dd></div><div><dt>Withdrawal requests</dt><dd>{requests.length}</dd></div><div><dt>Recent transactions</dt><dd>{recentTransactions.length}</dd></div></dl><div className="overview-accounts">{ownedAccounts.map((account) => <div key={account.id}><span><b>{account.name}</b><small>Account ••••{account.number.slice(-4)}</small></span><span><span className={`status status-${account.status}`}>{account.status}</span><b>{money(account.balance, account.currency)}</b></span></div>)}</div>{canMessage && <div className="overview-actions"><button className="button primary" type="button" onClick={() => setMessaging(true)}><Mail size={16}/>Send Message</button></div>}</>}</section></div>;
}
function AccountRows({ rows, users, canCredit }: { rows: Account[]; users: User[]; canCredit: boolean }) { const userById = new Map(users.map((user) => [user.id, user])); return rows.length ? <div className="data-table"><div className="table-row table-head"><span>Account</span><span>Customer</span><span>Currency</span><span>Status</span><span>Balance</span></div>{rows.map((r) => { const owner = userById.get(r.userId); return <div className="table-row" key={r.id}><span><b>{r.name}</b><small>Account ••••{r.number.slice(-4)}</small></span><span className="admin-user"><span className="avatar">{owner?.profileImageUrl ? <span className="avatar-image" role="img" aria-label={owner.name} style={{ backgroundImage: `url(${JSON.stringify(owner.profileImageUrl)})` }}/> : owner?.avatarInitials ?? "?"}</span><span><b>{owner?.name ?? "Unknown customer"}</b><small>{owner?.email}</small></span></span><span>{r.currency}</span><span className={`status status-${r.status}`}>{r.status}</span><span className="table-actions">{money(r.balance, r.currency)} {canCredit && r.status === "active" && owner && !owner.adminRole && owner.status === "active" && <CreditAccountDialog account={r} user={owner}/>}</span></div>; })}</div> : <Empty/>; }
function TransactionRows({ rows }: { rows: Transaction[] }) { return rows.length ? <div className="data-table"><div className="table-row table-head"><span>Transaction</span><span>Account</span><span>Date</span><span>Status</span><span>Amount</span></div>{rows.map((r) => <div className="table-row" key={r.id}><span><b>{r.description}</b><small>{r.reference}</small></span><span>{r.accountId}</span><span>{dateTime(r.occurredAt)}</span><span className={`status status-${r.status}`}>{r.status}</span><span className={r.amount >= 0 ? "positive" : ""}>{money(r.amount, r.currency)}</span></div>)}</div> : <Empty/>; }
function NotificationRows({ rows }: { rows: AdminNotification[] }) { return rows.length ? <div className="data-table"><div className="table-row table-head"><span>Notification</span><span>User</span><span>Kind</span><span>State</span><span>Created</span></div>{rows.map((r) => <div className="table-row" key={r.id}><span><b>{r.title}</b><small>{r.message}</small></span><span>{r.userId}</span><span>{r.kind}</span><span className={`status ${r.read ? "" : "status-pending"}`}>{r.read ? "read" : "unread"}</span><span>{dateTime(r.createdAt)}</span></div>)}</div> : <Empty/>; }
function RecoveryRows({ rows }: { rows: RecoveryRequest[] }) { return rows.length ? <div className="data-table"><div className="table-row table-head"><span>Request</span><span>User</span><span>Method</span><span>Risk</span><span>Status</span></div>{rows.map((r) => <div className="table-row" key={r.id}><span><b>{r.id}</b><small>{dateTime(r.submittedAt)}</small></span><span>{r.userId}</span><span>{r.method}</span><span className={`status status-${r.risk}`}>{r.risk}</span><span className={`status status-${r.status}`}>{r.status}</span></div>)}</div> : <Empty/>; }
function AuditRows({ rows }: { rows: AuditEvent[] }) { return rows.length ? <div className="data-table"><div className="table-row table-head"><span>Action</span><span>Actor</span><span>Target</span><span>Result</span><span>Timestamp</span></div>{rows.map((r) => <div className="table-row" key={r.id}><span><b>{r.action}</b><small>{r.id}</small></span><span>{r.actor}</span><span>{r.target}</span><span className={`status status-${r.result}`}>{r.result}</span><span>{dateTime(r.timestamp)}</span></div>)}</div> : <Empty/>; }

