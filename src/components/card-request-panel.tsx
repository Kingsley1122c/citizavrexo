"use client";

import { CreditCard, X } from "lucide-react";
import { useActionState, useState } from "react";
import { requestCardAction } from "@/app/user-actions";
import type { Account, CardRequest, UserProfile } from "@/lib/domain";
import type { Locale } from "@/lib/i18n/config";
import { localizeAccountName, localizeUserActionMessage, userUi } from "@/lib/i18n/user-ui";
import { formatCurrencyAmount } from "@/lib/currency";

const money = (amount: number, currency: string, locale: string) => {
  void locale;
  return formatCurrencyAmount(amount, currency, "en-US");
};
const date = (value: string, locale: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export function CardRequestPanel({ accounts, requests, profile, locale, onGoProfile }: { accounts: Account[]; requests: CardRequest[]; profile: UserProfile; locale: Locale; onGoProfile: () => void }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(requestCardAction, {});
  const text = userUi(locale).cardRequest;
  const profileText = userUi(locale).profileCompletion;
  const hasPending = requests.some((request) => request.status === "pending");
  const eligibleAccounts = accounts.filter((account) => account.status === "active");
  const profileApproved = profile.reviewStatus === "approved";
  const profileMessage = profile.reviewStatus === "pending_review" ? profileText.submittedMessage : profile.reviewStatus === "rejected" ? `${profileText.rejectedMessage}${profile.rejectionReason ? ` ${profile.rejectionReason}` : ""}` : text.incomplete;
  return <>
    <button className="button primary" type="button" disabled={hasPending || !eligibleAccounts.length || !profileApproved} title={!profileApproved ? profileMessage : hasPending ? text.pending : undefined} onClick={() => setOpen(true)}><CreditCard size={18}/>{text.request}</button>
    {!profileApproved && <div className="support-actions"><p className="note">{profileMessage} {profile.reviewStatus === "incomplete" && text.completePercent.replace("{percent}", String(profile.completionPercent))}</p><button className="button secondary" type="button" onClick={onGoProfile}>{userUi(locale).app.nav.profile}</button></div>}
    <section className="panel request-history">
      <div className="panel-title"><div><span className="eyebrow">{text.submitted.toUpperCase()}</span><h2>{text.requests}</h2></div></div>
      {requests.map((request) => <div className="request-row" key={request.id}><span><b>{request.label}</b><small>{(() => { const accountName = accounts.find((account) => account.id === request.accountId)?.name; return accountName ? localizeAccountName(locale, accountName) : text.account; })()} · {date(request.submittedAt, locale)}</small></span><span><span className={`status status-${request.status}`}>{text.statuses[request.status]}</span><small>{money(request.monthlyLimit, request.currency, locale)}</small></span></div>)}
      {!requests.length && <div className="empty-state"><CreditCard size={24}/><p>{text.empty}</p></div>}
    </section>
    {open && <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="card-request-title"><div className="panel-title"><div><span className="eyebrow">{text.request.toUpperCase()}</span><h2 id="card-request-title">{text.title}</h2></div><button className="icon-button" type="button" aria-label={text.cancel} onClick={() => setOpen(false)}><X size={18}/></button></div><p className="note">{text.text}</p><form action={action} className="form-grid modal-form"><label>{text.account}<select name="accountId" required defaultValue={eligibleAccounts[0]?.id}>{eligibleAccounts.map((account) => <option value={account.id} key={account.id}>{localizeAccountName(locale, account.name)} · {account.currency} · •• {account.number.slice(-4)}</option>)}</select></label><label>{text.label}<input name="label" required minLength={2} maxLength={40} placeholder={text.labelPlaceholder}/></label><label>{text.limit}<input name="monthlyLimit" type="number" min="100" max="1000000" step="100" required defaultValue="100000"/></label><div className="modal-actions"><button className="button secondary" type="button" onClick={() => setOpen(false)}>{text.cancel}</button><button className="button primary" disabled={pending}>{pending ? text.submitting : text.submit}</button></div></form>{state.error && <p className="auth-message error" role="alert">{state.error.includes("already pending") ? text.pending : localizeUserActionMessage(locale, state.error)}</p>}{state.success && <p className="auth-message success" role="status">{localizeUserActionMessage(locale, state.success) ?? text.success}</p>}</section></div>}
  </>;
}
