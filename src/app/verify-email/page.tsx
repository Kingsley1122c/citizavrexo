import Link from "next/link";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { resendVerificationAction } from "@/app/auth-actions";
import { verifyRegisteredEmail } from "@/lib/auth/auth-service";

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string; resend?: string }> }) {
  const { token = "", resend } = await searchParams;
  let verified = false;
  if (token) {
    try {
      verifyRegisteredEmail(token);
      verified = true;
    } catch {}
  }
  const resendMessage = resend === "requested"
    ? "If a pending account matches that email, a new verification link will be sent."
    : resend === "unavailable"
      ? "Verification email delivery is currently unavailable."
      : resend === "invalid"
        ? "Enter a valid email address."
        : undefined;

  return <main className="auth-page">
    <section className="auth-brand"><div className="brand"><BrandLogo tone="light"/></div><div><span className="eyebrow">VERIFIED ACCESS</span><h1>Email security,<br/>completed.</h1><p>Your account becomes available only after its email address is securely verified.</p></div><footer><ShieldCheck size={18}/>Single-use verification link</footer></section>
    <section className="auth-form-wrap"><form className="auth-form" action={resendVerificationAction}>
      <span className="auth-icon"><CheckCircle2 size={22}/></span>
      <h2>{verified ? "Email verified" : "Link unavailable"}</h2>
      <p className={`auth-message ${verified ? "success" : "error"}`} role={verified ? "status" : "alert"}>{verified ? "Your email address is verified. You can now sign in." : "This verification link is invalid, expired, or has already been used."}</p>
      {!verified && <>
        {resendMessage && <p className={`auth-message ${resend === "requested" ? "success" : "error"}`} role="status">{resendMessage}</p>}
        <label>Email address<span><input name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></span></label>
        <button className="button secondary auth-submit" type="submit">Request a new verification link</button>
      </>}
      <Link className="button primary auth-submit" href="/login">Continue to sign in</Link>
    </form></section>
  </main>;
}
