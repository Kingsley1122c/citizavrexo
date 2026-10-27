"use client";

import { useActionState, useState } from "react";
import { ArrowRight, Eye, KeyRound, LockKeyhole, UserRound } from "lucide-react";
import { completeAdministratorTransferAction } from "@/app/admin-transfer-actions";

export function AdministratorTransferForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(completeAdministratorTransferAction, {});
  const [showPassword, setShowPassword] = useState(false);
  return <main className="auth-page">
    <section className="auth-brand"><div className="brand"><span className="brand-mark"><i/></span><span>Nivora <b>Core</b></span></div><div><span className="eyebrow">SECURE OWNERSHIP TRANSFER</span><h1>Client access,<br/>verified.</h1><p>Accept administrator ownership through a time-limited invitation issued by the current super administrator.</p></div><footer><KeyRound size={15}/>Encrypted credentials and server-side sessions</footer></section>
    <section className="auth-form-wrap"><form action={action} className="auth-form">
      <span className="auth-icon"><UserRound size={23}/></span><h2>Accept ownership</h2><p>Confirm your name and choose a unique password for the new administrator identity.</p>
      <input type="hidden" name="verificationToken" value={token}/>
      <label>Full name<span><UserRound size={17}/><input name="newAdministratorName" autoComplete="name" placeholder="Your full name" required minLength={2} maxLength={100}/></span></label>
      <label>New password<span><LockKeyhole size={17}/><input name="newPassword" type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder="At least 12 characters" required minLength={12} maxLength={128}/><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)}><Eye size={17}/></button></span></label>
      {state.error && <p className="auth-message error" role="alert">{state.error}</p>}
      <button className="button primary auth-submit" type="submit" disabled={pending}>{pending ? "Verifying..." : "Accept ownership"}<ArrowRight size={18}/></button>
    </form></section>
  </main>;
}