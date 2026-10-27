"use client";

import { Check, ClipboardCheck, X } from "lucide-react";
import { useActionState, useState } from "react";
import { reviewUserProfileAction } from "@/app/admin-actions";
import type { UserProfile } from "@/lib/domain";

type ReviewProfile = UserProfile & { userId: string; userName: string; userEmail: string; updatedAt: string };

const dateTime = (value: string) => new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value));

export function AdminProfileReviews({ profiles }: { profiles: ReviewProfile[] }) {
  const [selected, setSelected] = useState<ReviewProfile | null>(null);
  const [decision, setDecision] = useState<"approved" | "rejected">("approved");
  const [state, action, pending] = useActionState(reviewUserProfileAction, {});
  return <>
    <div className="heading"><div><span className="eyebrow">CUSTOMER VERIFICATION</span><h1>Profile reviews</h1><p>Review submitted customer identity and residential information independently from physical card requests.</p></div></div>
    <section className="panel table-panel"><div className="data-table card-request-table"><div className="table-row table-head"><span>Customer</span><span>Location</span><span>Updated</span><span>Status</span><span>Review</span></div>{profiles.map((profile) => <div className="table-row" key={profile.userId}><span><b>{profile.userName}</b><small>{profile.userEmail}</small></span><span><b>{profile.city}, {profile.country}</b><small>{profile.phoneNumber}</small></span><span>{dateTime(profile.updatedAt)}</span><span><span className={`status status-${profile.reviewStatus}`}>{profile.reviewStatus.replaceAll("_", " ")}</span></span><span>{profile.reviewStatus === "pending_review" ? <button className="button secondary compact" onClick={() => { setSelected(profile); setDecision("approved"); }}>Review</button> : <small>{profile.reviewedAt ? dateTime(profile.reviewedAt) : "Not reviewed"}</small>}</span></div>)}</div>{!profiles.length && <div className="empty-state"><ClipboardCheck size={24}/><p>No customer profiles are available.</p></div>}</section>
    {selected && <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="profile-review-title"><div className="panel-title"><div><span className="eyebrow">REVIEW PROFILE</span><h2 id="profile-review-title">{selected.userName}</h2></div><button className="icon-button" aria-label="Close review" onClick={() => setSelected(null)}><X size={18}/></button></div><dl className="review-details"><div><dt>Legal name</dt><dd>{selected.legalName}</dd></div><div><dt>Date of birth</dt><dd>{selected.dateOfBirth}</dd></div><div><dt>Address</dt><dd>{selected.residentialAddress}</dd></div><div><dt>City</dt><dd>{selected.city}</dd></div><div><dt>State or province</dt><dd>{selected.stateProvince}</dd></div><div><dt>Country</dt><dd>{selected.country}</dd></div><div><dt>Postal code</dt><dd>{selected.postalCode}</dd></div><div><dt>Phone</dt><dd>{selected.phoneNumber}</dd></div></dl><form action={action} className="review-form"><input type="hidden" name="userId" value={selected.userId}/><div className="segmented" role="group" aria-label="Profile review decision"><button type="button" className={decision === "approved" ? "active" : ""} onClick={() => setDecision("approved")}><Check size={16}/>Approve</button><button type="button" className={decision === "rejected" ? "active danger-text" : "danger-text"} onClick={() => setDecision("rejected")}><X size={16}/>Reject</button></div><input type="hidden" name="decision" value={decision}/>{decision === "rejected" && <label>Reason<input name="rejectionReason" required minLength={3} maxLength={240} placeholder="Correction required from the customer"/></label>}<button className={`button ${decision === "rejected" ? "danger" : "primary"}`} disabled={pending}>{pending ? "Saving..." : `Confirm ${decision === "approved" ? "approval" : "rejection"}`}</button></form>{state.error && <p className="auth-message error" role="alert">{state.error}</p>}{state.success && <p className="auth-message success" role="status">{state.success}</p>}</section></div>}
  </>;
}
