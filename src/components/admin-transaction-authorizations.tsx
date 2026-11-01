"use client";

import { KeyRound, Send } from "lucide-react";
import { useActionState } from "react";
import { issueTransactionAuthorizationCodeAction } from "@/app/admin-actions";
import { formatCurrencyAmount } from "@/lib/currency";
import type { TransactionAuthorizationRequest } from "@/lib/domain";

const dateTime = (value: string) => new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value));

function AuthorizationRequest({ request }: { request: TransactionAuthorizationRequest }) {
  const [state, action, pending] = useActionState(issueTransactionAuthorizationCodeAction, {});
  const activeCode = request.codeStatus === "issued";
  return <article className="panel request-card">
    <div className="panel-title"><div><span className="eyebrow">{request.reference}</span><h2>{request.userName}</h2><p>{request.userEmail}</p></div><span className={`status status-${request.status}`}>{request.status.replaceAll("_", " ")}</span></div>
    <dl className="review-details">
      <div><dt>Sender</dt><dd>{request.senderAccountName} · ••••{request.senderAccountNumber.slice(-4)}</dd></div>
      <div><dt>Recipient</dt><dd>{request.recipientName} · ••••{request.recipientAccountNumber.slice(-4)}</dd></div>
      <div><dt>Sender pays</dt><dd>{formatCurrencyAmount(request.sourceAmount, request.sourceCurrency, "en-US")} {request.sourceCurrency}</dd></div>
      <div><dt>Recipient receives</dt><dd>{formatCurrencyAmount(request.recipientAmount, request.recipientCurrency, "en-US")} {request.recipientCurrency}</dd></div>
      <div><dt>Requested</dt><dd>{dateTime(request.requestedAt)}</dd></div>
      <div><dt>Code</dt><dd>{request.codeStatus ? `${request.codeStatus}${request.codeExpiresAt ? ` · ${dateTime(request.codeExpiresAt)}` : ""}` : "Not issued"}</dd></div>
    </dl>
    {(request.status === "pending" || request.status === "code_issued") && <form action={action} className="modal-actions">
      <input type="hidden" name="requestId" value={request.id}/><input type="hidden" name="mode" value={activeCode ? "reissue" : "issue"}/>
      <button className="button primary" disabled={pending}><Send size={16}/>{pending ? "Issuing..." : activeCode ? "Reissue code" : "Issue code"}</button>
    </form>}
    {state.issuedCode && <div className="auth-message success" role="status"><KeyRound size={17}/><b>{state.issuedCode}</b><span>Single-use code. Expires {dateTime(state.expiresAt!) }.</span></div>}
    {state.error && <p className="auth-message error" role="alert">{state.error}</p>}
    {state.success && !state.issuedCode && <p className="auth-message success" role="status">{state.success}</p>}
  </article>;
}

export function AdminTransactionAuthorizations({ requests }: { requests: TransactionAuthorizationRequest[] }) {
  const pending = requests.filter((request) => request.status === "pending" || request.status === "code_issued");
  return <><div className="heading"><div><span className="eyebrow">TRANSACTION SECURITY</span><h1>Transaction codes</h1><p>Issue a single-use code only after reviewing the exact sender, recipient, and amount.</p></div></div><section className="request-list">{pending.map((request) => <AuthorizationRequest key={request.id} request={request}/>)}{!pending.length && <div className="panel admin-placeholder"><KeyRound size={30}/><p>No transaction authorization requests are pending.</p></div>}</section></>;
}
