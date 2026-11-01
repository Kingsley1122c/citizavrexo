import Link from "next/link";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { BrandedStatus } from "@/components/branded-status";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { resendVerificationAction, verifyEmailAction } from "@/app/auth-actions";

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string; resend?: string; verified?: string }> }) {
  const { token = "", resend, verified } = await searchParams;
  const succeeded = verified === "success";
  const failed = verified === "invalid";
  const resendMessage = resend === "requested"
    ? "If a pending account matches that email, a new verification link will be sent."
    : resend === "unavailable"
      ? "Verification email delivery is currently unavailable."
      : resend === "invalid"
        ? "Enter a valid email address."
        : undefined;

  return <main className="auth-page">
    <section className="auth-brand"><div className="brand"><BrandLogo tone="light"/></div><div><span className="eyebrow">VERIFIED ACCESS</span><h1>Email security,<br/>completed.</h1><p>Your account becomes available only after its email address is securely verified.</p></div><footer><ShieldCheck size={18}/>Single-use verification link</footer></section>
    <section className="auth-form-wrap"><div className="auth-form">
      <span className="auth-icon"><CheckCircle2 size={22}/></span>
      <h2>{succeeded ? "Email verified" : token && !failed ? "Confirm your email" : "Verification help"}</h2>
      {succeeded && <BrandedStatus variant="success" message="Email verified" detail="Your email address is verified. You can now sign in." />}
      {failed && <BrandedStatus variant="error" message="Verification failed" detail="This verification link is invalid, expired, or has already been used." />}
      {token && !succeeded && !failed && <form action={verifyEmailAction}>
        <input type="hidden" name="token" value={token}/>
        <p>Enter the email address you registered with to activate your Citizavrexo account.</p>
        <label>Email address<span><input name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></span></label>
        <PendingSubmitButton idleLabel="Verify email address" pendingLabel="Verifying your email..." />
      </form>}
      {!succeeded && (!token || failed) && <form action={resendVerificationAction}>
        {resendMessage && <p className={`auth-message ${resend === "requested" ? "success" : "error"}`} role="status">{resendMessage}</p>}
        <label>Email address<span><input name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></span></label>
        <PendingSubmitButton idleLabel="Request a new verification link" pendingLabel="Sending verification email..." className="button secondary auth-submit" />
      </form>}
      {(succeeded || failed || !token) && <Link className="button primary auth-submit" href="/login">Continue to sign in</Link>}
    </div></section>
  </main>;
}
