"use client";

import { CheckCircle2 } from "lucide-react";
import { useActionState } from "react";
import { saveProfileAction } from "@/app/user-actions";
import type { UserProfile } from "@/lib/domain";
import type { Locale } from "@/lib/i18n/config";
import { localizeUserActionMessage, userUi } from "@/lib/i18n/user-ui";

export function ProfileCompletionForm({ profile, locale }: { profile: UserProfile; locale: Locale }) {
  const [state, action, pending] = useActionState(saveProfileAction, {});
  const t = userUi(locale);
  const pc = t.profileCompletion;
  const displayedProfile = state.profile ?? profile;
  const value = (name: keyof NonNullable<typeof state.values>) => state.values?.[name] ?? displayedProfile[name];
  const fieldError = (name: keyof NonNullable<typeof state.fieldErrors>) => state.fieldErrors?.[name];
  const statusLabel = displayedProfile.reviewStatus === "incomplete" ? pc.completionPercent.replace("{percent}", String(displayedProfile.completionPercent)) : displayedProfile.reviewStatus === "pending_review" ? t.cardRequest.statuses.pending : t.cardRequest.statuses[displayedProfile.reviewStatus];
  const statusMessage = displayedProfile.reviewStatus === "pending_review" ? pc.submittedMessage : displayedProfile.reviewStatus === "approved" ? pc.approvedMessage : displayedProfile.reviewStatus === "rejected" ? `${pc.rejectedMessage}${displayedProfile.rejectionReason ? ` ${displayedProfile.rejectionReason}` : ""}` : pc.subtitle;
  return <section className="panel">
    <div className="panel-title">
      <div><span className="eyebrow">{pc.overline}</span><h2>{pc.title}</h2></div>
      <span className={`status status-${displayedProfile.reviewStatus === "approved" ? "active" : displayedProfile.reviewStatus === "rejected" ? "rejected" : "pending"}`}>{displayedProfile.reviewStatus === "approved" && <CheckCircle2 size={14}/>} {statusLabel}</span>
    </div>
    <p className="note">{statusMessage}</p>
    <form action={action} className="form-grid">
      <ProfileField label={pc.legalName} error={fieldError("legalName")}><input name="legalName" required minLength={2} maxLength={120} defaultValue={value("legalName")}/></ProfileField>
      <ProfileField label={pc.dateOfBirth} error={fieldError("dateOfBirth")}><input name="dateOfBirth" type="date" required defaultValue={value("dateOfBirth")}/></ProfileField>
      <ProfileField label={pc.residentialAddress} error={fieldError("residentialAddress")}><input name="residentialAddress" required minLength={5} maxLength={180} defaultValue={value("residentialAddress")}/></ProfileField>
      <ProfileField label={pc.city} error={fieldError("city")}><input name="city" required minLength={2} maxLength={120} defaultValue={value("city")}/></ProfileField>
      <ProfileField label={pc.stateProvince} error={fieldError("stateProvince")}><input name="stateProvince" required minLength={2} maxLength={120} defaultValue={value("stateProvince")}/></ProfileField>
      <ProfileField label={pc.countryCode} error={fieldError("country")}><input name="country" required minLength={2} maxLength={2} pattern="[A-Za-z]{2}" autoCapitalize="characters" placeholder="US" defaultValue={value("country")}/></ProfileField>
      <ProfileField label={pc.postalCode} error={fieldError("postalCode")}><input name="postalCode" required minLength={2} maxLength={20} defaultValue={value("postalCode")}/></ProfileField>
      <ProfileField label={pc.phoneNumber} error={fieldError("phoneNumber")}><input name="phoneNumber" type="tel" inputMode="tel" required minLength={7} maxLength={20} pattern="\+[1-9][0-9]{6,19}" placeholder="+1..." defaultValue={value("phoneNumber")}/></ProfileField>
      <button className="button primary" disabled={pending} aria-busy={pending}>{pending ? "Saving profile..." : pc.saveRequiredInformation}</button>
    </form>
    {state.error && !state.fieldErrors && <p className="auth-message error" role="alert">{localizeUserActionMessage(locale, state.error)}</p>}
    {state.success && <p className="auth-message success" role="status">{localizeUserActionMessage(locale, state.success)}</p>}
  </section>;
}

function ProfileField({ label, error, children }: { label: string; error?: string; children: React.ReactElement<React.InputHTMLAttributes<HTMLInputElement>> }) {
  return <label className={error ? "field-invalid" : undefined}>{label}{children}{error && <small className="field-error" role="alert">{error}</small>}</label>;
}
