"use client";

import { useActionState } from "react";
import { Check, CircleDollarSign, X } from "lucide-react";
import { reviewCurrencyChangeAction } from "@/app/admin-actions";
import type { CurrencyChangeRequest } from "@/lib/domain";

function ReviewForm({ request }: { request: CurrencyChangeRequest }) {
  const [state, action, pending] = useActionState(reviewCurrencyChangeAction, {});
  return <form action={action} className="request-review-form">
    <input type="hidden" name="requestId" value={request.id}/>
    <label>Rejection reason <small>Required only when rejecting</small><textarea name="rejectionReason" minLength={3} maxLength={240} rows={2}/></label>
    {state.error && <p className="auth-message error" role="alert">{state.error}</p>}
    {state.success && <p className="auth-message success" role="status">{state.success}</p>}
    <div className="table-actions"><button className="button secondary" type="submit" name="decision" value="rejected" disabled={pending} aria-busy={pending}><X size={16}/>{pending ? "Processing..." : "Reject"}</button><button className="button primary" type="submit" name="decision" value="approved" disabled={pending} aria-busy={pending}><Check size={16}/>{pending ? "Processing..." : "Approve"}</button></div>
  </form>;
}

export function AdminCurrencyChangeRequests({ requests }: { requests: CurrencyChangeRequest[] }) {
  return <><div className="heading"><div><span className="eyebrow">FINANCIAL CONTROL</span><h1>Currency requests</h1><p>Approval rechecks the zero-balance, withdrawal, and card conditions atomically.</p></div></div><section className="panel"><div className="panel-title"><div><h2>Review queue</h2></div><span className="round-icon"><CircleDollarSign size={19}/></span></div>{requests.length ? <div className="request-history">{requests.map((request) => <article className="request-row" key={request.id}><span><b>{request.userName} · {request.currentCurrency} → {request.requestedCurrency}</b><small>Account ••••{request.accountNumber?.slice(-4)} · {new Date(request.requestedAt).toLocaleString()}</small>{request.reason && <small>{request.reason}</small>}</span>{request.status === "pending" ? <ReviewForm request={request}/> : <span className={`status status-${request.status}`}>{request.status}</span>}</article>)}</div> : <div className="admin-placeholder"><p>No currency-change requests are available.</p></div>}</section></>;
}