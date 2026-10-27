"use client";

import { useActionState, useState } from "react";
import { ArrowRightLeft, ShieldCheck } from "lucide-react";
import { requestCurrencyChangeAction } from "@/app/user-actions";
import { currencyConfig, SUPPORTED_CURRENCIES } from "@/lib/currency";
import type { Account, CurrencyChangeRequest } from "@/lib/domain";

export function CurrencyChangePanel({ accounts, requests }: { accounts: Account[]; requests: CurrencyChangeRequest[] }) {
  const [state, action, pending] = useActionState(requestCurrencyChangeAction, {});
  const eligible = accounts.filter((account) => account.status === "active");
  const [accountId, setAccountId] = useState(eligible[0]?.id ?? "");
  const account = eligible.find((item) => item.id === accountId);
  const pendingAccountIds = new Set(requests.filter((request) => request.status === "pending").map((request) => request.accountId));
  return <section className="panel currency-change-panel">
    <div className="panel-title"><div><span className="eyebrow">ACCOUNT CURRENCY</span><h2>Request a currency change</h2></div><span className="round-icon"><ArrowRightLeft size={19}/></span></div>
    <p className="note">For financial integrity, the account must have a zero balance, no pending withdrawal, and no active or pending card. Existing balances and historical transactions are never converted.</p>
    <form action={action} className="form-grid">
      <label>Account<select name="accountId" value={accountId} onChange={(event) => setAccountId(event.target.value)} required>{eligible.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.currency} · ••••{item.number.slice(-4)}</option>)}</select></label>
      <label>New account currency<select name="requestedCurrency" defaultValue="EUR" required>{SUPPORTED_CURRENCIES.filter((currency) => currency !== account?.currency).map((currency) => <option value={currency} key={currency}>{currency} · {currencyConfig[currency].name}</option>)}</select></label>
      <label>Reason <small>Optional</small><textarea name="reason" maxLength={240} rows={3} placeholder="Tell the review team why you need this change."/></label>
      {account && pendingAccountIds.has(account.id) && <p className="auth-message">A request for this account is already pending review.</p>}
      {state.error && <p className="auth-message error" role="alert">{state.error}</p>}
      {state.success && <p className="auth-message success" role="status">{state.success}</p>}
      <button className="button primary" type="submit" disabled={pending || !account || pendingAccountIds.has(account.id)} aria-busy={pending}><ShieldCheck size={17}/>{pending ? "Submitting..." : "Submit for review"}</button>
    </form>
    {requests.length > 0 && <div className="request-history"><h3>Recent requests</h3>{requests.slice(0, 5).map((request) => <div className="request-row" key={request.id}><span><b>{request.currentCurrency} → {request.requestedCurrency}</b><small>{new Date(request.requestedAt).toLocaleDateString()}</small></span><span className={`status status-${request.status}`}>{request.status}</span></div>)}</div>}
  </section>;
}