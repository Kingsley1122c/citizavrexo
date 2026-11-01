import Link from "next/link";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { verifyRegisteredEmail } from "@/lib/auth/auth-service";

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  let verified = false;
  try {
    verifyRegisteredEmail(token);
    verified = true;
  } catch {}

  return <main className="auth-page">
    <section className="auth-brand"><div className="brand"><BrandLogo tone="light"/></div><div><span className="eyebrow">VERIFIED ACCESS</span><h1>Email security,<br/>completed.</h1><p>Your account becomes available only after its email address is securely verified.</p></div><footer><ShieldCheck size={18}/>Single-use verification link</footer></section>
    <section className="auth-form-wrap"><div className="auth-form">
      <span className="auth-icon"><CheckCircle2 size={22}/></span>
      <h2>{verified ? "Email verified" : "Link unavailable"}</h2>
      <p className={`auth-message ${verified ? "success" : "error"}`} role={verified ? "status" : "alert"}>{verified ? "Your email address is verified. You can now sign in." : "This verification link is invalid, expired, or has already been used."}</p>
      <Link className="button primary auth-submit" href="/login">Continue to sign in</Link>
    </div></section>
  </main>;
}
