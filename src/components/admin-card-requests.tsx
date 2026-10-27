"use client";

import { Check, CreditCard, X } from "lucide-react";
import { useActionState, useState } from "react";
import { reviewCardRequestAction } from "@/app/admin-actions";
import type { CardRequest, ManagedCard } from "@/lib/domain";
import { formatCurrencyAmount } from "@/lib/currency";

const dateTime = (value: string) => new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value));
const money = (value: number, currency: string) => formatCurrencyAmount(value, currency, "en");

export function AdminCardRequests({ requests, cards }: { requests: CardRequest[]; cards: ManagedCard[] }) {
  const [selected, setSelected] = useState<CardRequest | null>(null);
  const [decision, setDecision] = useState<"approved" | "rejected">("approved");
  const [state, action, pending] = useActionState(reviewCardRequestAction, {});
  return <>
    <div className="heading"><div><span className="eyebrow">CARD OPERATIONS</span><h1>Physical card requests</h1><p>Review physical card requests and their current state.</p></div></div>
    <section className="panel table-panel"><div className="data-table card-request-table"><div className="table-row table-head"><span>Requesting user</span><span>Account</span><span>Submitted</span><span>Status</span><span>Review</span></div>{requests.map((request) => <div className="table-row" key={request.id}><span><b>{request.userName}</b><small>{request.userEmail}</small></span><span><b>{request.accountName}</b><small>{request.label}</small></span><span>{dateTime(request.submittedAt)}</span><span><span className={`status status-${request.status}`}>{request.status}</span></span><span>{request.status === "pending" ? <button className="button secondary compact" onClick={() => { setSelected(request); setDecision("approved"); }}>Review</button> : <small>{request.reviewedAt ? dateTime(request.reviewedAt) : "Not reviewed"}</small>}</span></div>)}</div>{!requests.length && <div className="empty-state"><CreditCard size={24}/><p>No card requests are available.</p></div>}</section>
    {selected && <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="review-title"><div className="panel-title"><div><span className="eyebrow">REVIEW REQUEST</span><h2 id="review-title">{selected.userName}</h2></div><button className="icon-button" aria-label="Close review" onClick={() => setSelected(null)}><X size={18}/></button></div><dl className="review-details"><div><dt>Account</dt><dd>{selected.accountName}</dd></div><div><dt>Card label</dt><dd>{selected.label}</dd></div><div><dt>Monthly limit</dt><dd>{money(selected.monthlyLimit, selected.currency)}</dd></div><div><dt>Existing cards</dt><dd>{cards.filter((card) => card.accountId === selected.accountId).length}</dd></div></dl><form action={action} className="review-form"><input type="hidden" name="requestId" value={selected.id}/><div className="segmented" role="group" aria-label="Review decision"><button type="button" className={decision === "approved" ? "active" : ""} onClick={() => setDecision("approved")}><Check size={16}/>Approve</button><button type="button" className={decision === "rejected" ? "active danger-text" : "danger-text"} onClick={() => setDecision("rejected")}><X size={16}/>Reject</button></div><input type="hidden" name="decision" value={decision}/>{decision === "rejected" && <label>Reason<input name="rejectionReason" required minLength={3} maxLength={240} placeholder="Reason for rejection"/></label>}<button className={`button ${decision === "rejected" ? "danger" : "primary"}`} disabled={pending}>{pending ? "Saving..." : `Confirm ${decision === "approved" ? "approval" : "rejection"}`}</button></form>{state.error && <p className="auth-message error" role="alert">{state.error}</p>}{state.success && <p className="auth-message success" role="status">{state.success}</p>}</section></div>}
  </>;
}
