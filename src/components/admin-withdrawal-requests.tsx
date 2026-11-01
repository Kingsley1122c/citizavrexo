"use client";

import { ArrowDownLeft, Check, RefreshCcw, Shield, ShieldAlert, Trash2, X } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import {
  issueWithdrawalAuthorizationCodeAction,
  revokeWithdrawalAuthorizationCodeAction,
  reviewWithdrawalRequestAction,
  type AdminActionState,
  type WithdrawalAuthorizationAdminState,
} from "@/app/admin-actions";
import type { WithdrawalRequest } from "@/lib/domain";
import { formatCurrencyAmount } from "@/lib/currency";

const dateTime = (value?: string) => {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value));
};

const money = (value: number, currency: string) => formatCurrencyAmount(value, currency, "en");

const stageLabel = (stage: "withdrawal_code" | "swift_code") => stage === "withdrawal_code" ? "Withdrawal code" : "SWIFT authorization code";

function AuthorizationStageCard({
  request,
  stage,
}: {
  request: WithdrawalRequest;
  stage: "withdrawal_code" | "swift_code";
}) {
  const [issueState, issueAction, issuing] = useActionState<WithdrawalAuthorizationAdminState, FormData>(issueWithdrawalAuthorizationCodeAction, {});
  const [revokeState, revokeAction, revoking] = useActionState<AdminActionState, FormData>(revokeWithdrawalAuthorizationCodeAction, {});
  const isWithdrawalStage = stage === "withdrawal_code";
  const status = isWithdrawalStage ? request.withdrawalCodeStatus : request.swiftCodeStatus;
  const issuedAt = isWithdrawalStage ? request.withdrawalCodeIssuedAt : request.swiftCodeIssuedAt;
  const expiresAt = isWithdrawalStage ? request.withdrawalCodeExpiresAt : request.swiftCodeExpiresAt;
  const issuedBy = isWithdrawalStage ? request.withdrawalCodeIssuedBy : request.swiftCodeIssuedBy;
  const stageReady = isWithdrawalStage
    ? request.authorizationStage === "awaiting_withdrawal_code" || request.authorizationStage === "awaiting_swift_code" || request.authorizationStage === "authorized"
    : request.authorizationStage === "awaiting_swift_code" || request.authorizationStage === "authorized";
  const stageVerified = isWithdrawalStage
    ? request.authorizationStage === "awaiting_swift_code" || request.authorizationStage === "authorized"
    : request.authorizationStage === "authorized";
  const issueDisabled = request.status !== "pending" || !stageReady || stageVerified;

  return (
    <div className="panel section-stack">
      <div className="section-row" style={{ justifyContent: "space-between" }}>
        <h3>{stageLabel(stage)}</h3>
        <span className={`status status-${status ?? "pending"}`}>{status ?? "not_issued"}</span>
      </div>
      <p>
        {stage === "withdrawal_code"
          ? "Issue this code after PIN verification and customer-service checks are complete."
          : "Issue SWIFT authorization only after withdrawal code verification succeeds."}
      </p>
      <dl className="review-details compact">
        <div>
          <dt>Issued at</dt>
          <dd>{dateTime(issuedAt)}</dd>
        </div>
        <div>
          <dt>Expires</dt>
          <dd>{dateTime(expiresAt)}</dd>
        </div>
        <div>
          <dt>Issued by</dt>
          <dd>{issuedBy ?? "Not recorded"}</dd>
        </div>
      </dl>
      {!stageReady && (
        <p className="note">This stage is locked until the previous authorization stage is verified.</p>
      )}
      {stageVerified && (
        <p className="note">This stage is already verified.</p>
      )}
      <div className="modal-actions">
        <form action={issueAction}>
          <input type="hidden" name="requestId" value={request.id} />
          <input type="hidden" name="stage" value={stage} />
          <input type="hidden" name="mode" value="issue" />
          <button className="button primary" disabled={issueDisabled || issuing}>
            <Shield size={16} />
            Issue code
          </button>
        </form>
        <form action={issueAction}>
          <input type="hidden" name="requestId" value={request.id} />
          <input type="hidden" name="stage" value={stage} />
          <input type="hidden" name="mode" value="reissue" />
          <button className="button secondary" disabled={issueDisabled || issuing}>
            <RefreshCcw size={16} />
            Reissue
          </button>
        </form>
        <form action={revokeAction}>
          <input type="hidden" name="requestId" value={request.id} />
          <input type="hidden" name="stage" value={stage} />
          <button className="button ghost" disabled={request.status !== "pending" || status !== "issued" || revoking}>
            <Trash2 size={16} />
            Revoke
          </button>
        </form>
      </div>
      {issueState.success && (
        <p className="auth-message success" role="status">
          {issueState.success}
          {issueState.issuedCode ? ` Code: ${issueState.issuedCode}` : ""}
        </p>
      )}
      {issueState.error && <p className="auth-message error">{issueState.error}</p>}
      {revokeState.success && <p className="auth-message success">{revokeState.success}</p>}
      {revokeState.error && <p className="auth-message error">{revokeState.error}</p>}
    </div>
  );
}

export function AdminWithdrawalRequests({ requests }: { requests: WithdrawalRequest[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [decision, setDecision] = useState<"completed" | "rejected">("completed");
  const [state, action, pending] = useActionState<AdminActionState, FormData>(reviewWithdrawalRequestAction, {});
  const selected = useMemo(() => requests.find((request) => request.id === selectedId) ?? null, [requests, selectedId]);

  return (
    <>
      <div className="heading">
        <div>
          <span className="eyebrow">CUSTOMER SERVICE</span>
          <h1>Withdrawal requests</h1>
          <p>Issue stage codes, monitor authorization attempts, and complete review only after full authorization.</p>
        </div>
      </div>
      <section className="panel table-panel">
        <div className="data-table withdrawal-request-table">
          <div className="table-row table-head">
            <span>Customer</span>
            <span>Destination</span>
            <span>Request</span>
            <span>Authorization</span>
            <span>Review</span>
          </div>
          {requests.map((request) => (
            <div className="table-row" key={request.id}>
              <span className="admin-user">
                <span className="avatar">
                  {request.userProfileImageUrl ? (
                    <span
                      className="avatar-image"
                      role="img"
                      aria-label={request.userName}
                      style={{ backgroundImage: `url(${JSON.stringify(request.userProfileImageUrl)})` }}
                    />
                  ) : (
                    request.userAvatarInitials ?? "?"
                  )}
                </span>
                <span>
                  <b>{request.userName}</b>
                  <small>{request.userEmail}</small>
                </span>
              </span>
              <span>
                <b>{request.destinationBankName ?? "Legacy request"}</b>
                <small>{request.destinationAccountName ?? "Destination unavailable"} · {request.destinationAccountNumber ? `••••${request.destinationAccountNumber.slice(-4)}` : "Not captured"}</small>
              </span>
              <span>
                <b>{money(request.amount, request.currency)}</b>
                <small>{request.reference} · {dateTime(request.submittedAt)}</small>
              </span>
              <span>
                <span className={`status status-${request.authorizationStage}`}>{request.authorizationStage}</span>
                <small>
                  {request.withdrawalCodeStatus ?? "not_issued"} / {request.swiftCodeStatus ?? "not_issued"}
                </small>
              </span>
              <span>
                {request.status === "pending" ? (
                  <button
                    className="button secondary compact"
                    onClick={() => {
                      setSelectedId(request.id);
                      setDecision("completed");
                    }}
                  >
                    Manage
                  </button>
                ) : (
                  <small>{request.reviewedAt ? dateTime(request.reviewedAt) : "Not reviewed"}</small>
                )}
              </span>
            </div>
          ))}
        </div>
        {!requests.length && (
          <div className="empty-state">
            <ArrowDownLeft size={24} />
            <p>No withdrawal requests are available.</p>
          </div>
        )}
      </section>

      {selected && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="withdrawal-review-title">
            <div className="panel-title">
              <div className="admin-user">
                <span className="avatar">
                  {selected.userProfileImageUrl ? (
                    <span
                      className="avatar-image"
                      role="img"
                      aria-label={selected.userName}
                      style={{ backgroundImage: `url(${JSON.stringify(selected.userProfileImageUrl)})` }}
                    />
                  ) : (
                    selected.userAvatarInitials ?? "?"
                  )}
                </span>
                <span>
                  <span className="eyebrow">WITHDRAWAL AUTHORIZATION</span>
                  <h2 id="withdrawal-review-title">{selected.userName}</h2>
                  <small>{selected.userEmail}</small>
                </span>
              </div>
              <button className="icon-button" aria-label="Close withdrawal review" onClick={() => setSelectedId(null)}>
                <X size={18} />
              </button>
            </div>

            <dl className="review-details">
              <div>
                <dt>Reference</dt>
                <dd>{selected.reference}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <span className={`status status-${selected.status}`}>{selected.status}</span>
                </dd>
              </div>
              <div>
                <dt>Authorization stage</dt>
                <dd>
                  <span className={`status status-${selected.authorizationStage}`}>{selected.authorizationStage}</span>
                </dd>
              </div>
              <div>
                <dt>PIN verified at</dt>
                <dd>{dateTime(selected.pinVerifiedAt)}</dd>
              </div>
              <div>
                <dt>Authorization completed at</dt>
                <dd>{dateTime(selected.authorizationCompletedAt)}</dd>
              </div>
              <div>
                <dt>Amount</dt>
                <dd>{money(selected.amount, selected.currency)}</dd>
              </div>
            </dl>

            <AuthorizationStageCard request={selected} stage="withdrawal_code" />
            <AuthorizationStageCard request={selected} stage="swift_code" />

            <div className="panel section-stack">
              <div className="section-row" style={{ justifyContent: "space-between" }}>
                <h3>Authorization history</h3>
                <ShieldAlert size={18} />
              </div>
              {selected.authorizationHistory?.length ? (
                <div className="data-table">
                  <div className="table-row table-head">
                    <span>When</span>
                    <span>Stage</span>
                    <span>Event</span>
                    <span>Reason</span>
                  </div>
                  {selected.authorizationHistory.map((entry) => (
                    <div className="table-row" key={entry.id}>
                      <span>{dateTime(entry.createdAt)}</span>
                      <span>{entry.stage}</span>
                      <span>{entry.event}</span>
                      <span>{entry.reason}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="note">No authorization attempts recorded yet.</p>
              )}
            </div>

            <form action={action} className="review-form">
              <input type="hidden" name="requestId" value={selected.id} />
              <div className="segmented" role="group" aria-label="Withdrawal review decision">
                <button type="button" className={decision === "completed" ? "active" : ""} onClick={() => setDecision("completed")}>
                  <Check size={16} />
                  Mark completed
                </button>
                <button type="button" className={decision === "rejected" ? "active" : ""} onClick={() => setDecision("rejected")}>
                  <X size={16} />
                  Reject
                </button>
              </div>
              <input type="hidden" name="decision" value={decision} />
              {decision === "rejected" && (
                <label className="workflow-field">
                  Rejection reason
                  <textarea name="reason" required minLength={3} maxLength={240} placeholder="State why this withdrawal request is rejected." />
                </label>
              )}
              <button className="button primary" disabled={pending || selected.authorizationStage !== "authorized"}>
                {pending ? "Submitting..." : "Submit review"}
              </button>
              {selected.authorizationStage !== "authorized" && (
                <p className="note">Review is blocked until both authorization stages are verified.</p>
              )}
            </form>

            {state.success && <p className="auth-message success">{state.success}</p>}
            {state.error && <p className="auth-message error">{state.error}</p>}
          </section>
        </div>
      )}
    </>
  );
}
