import Link from "next/link";
import { ArrowRight, Check, CreditCard, Globe2, History, Landmark, MessageCircle, Send, ShieldCheck } from "lucide-react";
import { PublicFooter, PublicHeader } from "@/components/public-site-chrome";

const features = [
  [Landmark, "Simple account management", "See balances, account details, and activity in one focused workspace."],
  [Send, "Secure transfers", "Review recipient and payment details before each server-verified transfer."],
  [History, "Transaction history", "Search activity, inspect balances, and keep clear transfer references."],
  [CreditCard, "Physical cards", "Request and manage eligible physical cards from your account."],
  [MessageCircle, "Withdrawal requests", "Submit a request, then continue safely with Customer Service."],
  [ShieldCheck, "Account security", "Manage trusted devices, recovery options, and security activity."],
  [Globe2, "Multi-language experience", "Use Nivora Core across fourteen supported languages."],
] as const;

export default function Home() {
  return <main className="landing-page">
    <PublicHeader/>

    <section className="landing-hero">
      <div className="landing-hero-copy"><span className="eyebrow">MODERN FINANCIAL CLARITY</span><h1>Banking made beautifully simple.</h1><p>Manage your Nivora Core account, transfers, physical cards, withdrawal requests, and security in one calm, protected workspace.</p><div className="landing-actions"><Link className="button primary" href="/register">Get Started<ArrowRight size={17}/></Link><Link className="button landing-secondary" href="/login">Sign In</Link></div><small><ShieldCheck size={15}/>Application-managed financial records. No real banking rail.</small></div>
      <div className="landing-product" aria-label="Nivora Core product preview">
        <div className="landing-preview-head"><span>Account overview</span><span className="status status-active">Active</span></div><small>AVAILABLE BALANCE · USD</small><strong>$12,500.00</strong><div className="landing-account"><span><small>ACCOUNT</small>Personal Account</span><span><small>NUMBER</small>•••• 4821</span></div><div className="landing-preview-actions"><span><Send size={17}/>Send</span><span><MessageCircle size={17}/>Withdraw</span><span><History size={17}/>History</span></div>
      </div>
    </section>

    <section className="landing-features" aria-labelledby="features-title"><div className="landing-section-head"><span className="eyebrow">ONE CLEAR WORKSPACE</span><h2 id="features-title">Everything essential, thoughtfully organized.</h2><p>Purpose-built account tools with no distracting products or unnecessary complexity.</p></div><div className="feature-grid">{features.map(([Icon, title, text]) => <article key={title}><span><Icon size={19}/></span><h3>{title}</h3><p>{text}</p></article>)}</div></section>

    <section className="landing-security" id="security"><div><span className="eyebrow">SECURITY BY DESIGN</span><h2>Protection that stays understandable.</h2><p>Nivora Core uses authenticated sessions, role-based access, account ownership checks, audit records, and idempotent transaction handling. Sensitive credentials are never included in customer notifications or support messages.</p></div><ul><li><Check size={16}/>Server-verified financial actions</li><li><Check size={16}/>Customer and administrator access boundaries</li><li><Check size={16}/>Session and trusted-device controls</li></ul></section>

    <section className="landing-cta"><div><span className="eyebrow">NIVORA CORE</span><h2>Your financial workspace, ready when you are.</h2></div><div className="landing-actions"><Link className="button primary" href="/register">Create Account<ArrowRight size={17}/></Link><Link className="button landing-secondary" href="/login">Sign In</Link></div></section>

    <PublicFooter/>
  </main>;
}
