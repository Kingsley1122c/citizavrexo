"use client";

import { useActionState } from "react";
import { ArrowRightLeft, Mail, ShieldCheck } from "lucide-react";
import { initiateAdministratorTransferAction } from "@/app/admin-transfer-actions";

export function AdministratorTransferPanel() {
  const [state, action, pending] = useActionState(initiateAdministratorTransferAction, {});
  return <>
    <div className="heading"><div><span className="eyebrow">OWNERSHIP CONTROL</span><h1>Settings</h1><p>Transfer administrator ownership only to a verified client-controlled address.</p></div></div>
    <section className="panel transfer-panel">
      <div className="panel-title"><div><span className="eyebrow">SUPER ADMINISTRATOR</span><h2>Transfer ownership</h2></div><span className="round-icon"><ArrowRightLeft size={18}/></span></div>
      <p className="note">The recipient must verify their email and set a new password. Completing the transfer suspends this administrator identity and revokes all of its sessions.</p>
      <form action={action} className="form-grid">
        <label>New administrator email<input name="newEmail" type="email" autoComplete="email" placeholder="client@example.com" required maxLength={254}/></label>
        <label>Current password<input name="currentPassword" type="password" autoComplete="current-password" placeholder="Confirm your password" required minLength={12} maxLength={128}/></label>
        <div className="transfer-submit">
          <span><Mail size={17}/><small>A 30-minute, single-use verification link will be sent to the recipient.</small></span>
          <button className="button primary" type="submit" disabled={pending}><ShieldCheck size={17}/>{pending ? "Verifying..." : "Begin secure transfer"}</button>
        </div>
      </form>
      {state.error && <p className="auth-message error" role="alert">{state.error}</p>}
      {state.success && <p className="auth-message success" role="status">{state.success}</p>}
    </section>
  </>;
}