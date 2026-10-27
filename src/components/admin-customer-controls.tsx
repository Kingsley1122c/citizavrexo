"use client";

import { Ban, CircleDollarSign, RotateCcw, X } from "lucide-react";
import { useActionState, useState } from "react";
import { changeUserStatusAction, creditUserAccountAction } from "@/app/admin-actions";
import type { Account, User } from "@/lib/domain";
import { currencyInputStep, formatCurrencyAmount } from "@/lib/currency";

export function CreditAccountDialog({ account, user }: { account: Account; user: User }) {
  const [open, setOpen] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [operationKey, setOperationKey] = useState("");
  const [balanceBefore, setBalanceBefore] = useState(account.balance);
  const [state, action, pending] = useActionState(creditUserAccountAction, {});
  const show = () => { setOperationKey(`admin-credit-${crypto.randomUUID()}`); setBalanceBefore(account.balance); setAmount(""); setReason(""); setReviewing(false); setOpen(true); };
  const formattedAmount = formatCurrencyAmount(Number(amount) || 0, account.currency);
  return <>
    <button className="icon-button" type="button" title="Credit account" aria-label={`Credit ${account.name}`} onClick={show}><CircleDollarSign size={17}/></button>
    {open && <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-labelledby={`credit-${account.id}`}>
      <div className="panel-title"><div className="admin-user"><span className="avatar">{user.profileImageUrl ? <span className="avatar-image" role="img" aria-label={user.name} style={{ backgroundImage: `url(${JSON.stringify(user.profileImageUrl)})` }}/> : user.avatarInitials}</span><span><span className="eyebrow">ACCOUNT CREDIT</span><h2 id={`credit-${account.id}`}>{user.name}</h2><small>{user.email}</small></span></div><button className="icon-button" type="button" aria-label="Close" onClick={() => setOpen(false)}><X size={18}/></button></div>
      <p className="note">This directly increases the customer&apos;s {account.currency} ledger balance and creates an immutable transaction and audit record.</p>
      {reviewing ? <><dl className="review-details"><div><dt>Customer</dt><dd>{user.name}<small>{user.email}</small></dd></div><div><dt>Account</dt><dd>{account.name} · ••••{account.number.slice(-4)}</dd></div><div><dt>Amount</dt><dd><b>{formattedAmount} {account.currency}</b></dd></div><div><dt>Currency</dt><dd>{account.currency}</dd></div><div><dt>Reason</dt><dd>{reason}</dd></div><div><dt>Balance after credit</dt><dd>{formatCurrencyAmount(balanceBefore + Number(amount), account.currency)} {account.currency}</dd></div></dl><form action={action} className="review-form"><input type="hidden" name="accountId" value={account.id}/><input type="hidden" name="currency" value={account.currency}/><input type="hidden" name="idempotencyKey" value={operationKey}/><input type="hidden" name="amount" value={amount}/><input type="hidden" name="reason" value={reason}/><div className="modal-actions"><button className="button secondary" type="button" onClick={() => setReviewing(false)}>Back</button><button className="button primary" disabled={pending} aria-busy={pending}><CircleDollarSign size={17}/>{pending ? "Crediting..." : "Confirm credit"}</button></div></form></> : <form className="form-grid" onSubmit={(event) => { event.preventDefault(); setReviewing(true); }}><label>Amount ({account.currency})<input value={amount} onChange={(event) => setAmount(event.target.value)} type="number" min={currencyInputStep(account.currency)} step={currencyInputStep(account.currency)} required/></label><label>Reason<input value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={200} required placeholder="Account credit"/></label><div className="modal-actions"><button className="button secondary" type="button" onClick={() => setOpen(false)}>Cancel</button><button className="button primary" type="submit">Review credit</button></div></form>}
      {state.error && <p className="auth-message error" role="alert">{state.error}</p>}{state.success && <p className="auth-message success" role="status">{state.success}</p>}
    </section></div>}
  </>;
}

export function UserStatusDialog({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(changeUserStatusAction, {});
  const suspending = user.status !== "suspended";
  return <>
    <button className={`icon-button ${suspending ? "danger-text" : ""}`} type="button" title={suspending ? "Suspend customer" : "Restore customer"} aria-label={`${suspending ? "Suspend" : "Restore"} ${user.name}`} onClick={() => setOpen(true)}>{suspending ? <Ban size={17}/> : <RotateCcw size={17}/>}</button>
    {open && <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-labelledby={`status-${user.id}`}>
      <div className="panel-title"><div><span className="eyebrow">CUSTOMER ACCESS</span><h2 id={`status-${user.id}`}>{suspending ? "Suspend" : "Restore"} {user.name}</h2></div><button className="icon-button" type="button" aria-label="Close" onClick={() => setOpen(false)}><X size={18}/></button></div>
      <p className="note">{suspending ? "Suspension immediately revokes every active session and trusted device." : "Restoration allows the customer to sign in again. Previous suspension history remains immutable."}</p>
      {!suspending && user.suspensionReason && <dl className="review-details"><div><dt>Suspension reason</dt><dd>{user.suspensionReason}</dd></div>{user.suspendedAt && <div><dt>Suspended</dt><dd>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(user.suspendedAt))}</dd></div>}</dl>}
      <form action={action} className="form-grid"><input type="hidden" name="userId" value={user.id}/><input type="hidden" name="nextStatus" value={suspending ? "suspended" : "active"}/><label>{suspending ? "Suspension reason" : "Restoration note"}<input name="reason" required={suspending} minLength={3} maxLength={240} placeholder={suspending ? "Reason shown in the audit history" : "Account access restored"}/></label><button className={`button ${suspending ? "danger" : "primary"}`} disabled={pending}>{suspending ? <Ban size={17}/> : <RotateCcw size={17}/>} {pending ? "Saving..." : `Confirm ${suspending ? "suspension" : "restoration"}`}</button></form>
      {state.error && <p className="auth-message error" role="alert">{state.error}</p>}{state.success && <p className="auth-message success" role="status">{state.success}</p>}
    </section></div>}
  </>;
}
