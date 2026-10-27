import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PublicLanguageSelect } from "@/components/public-language-select";
import { getCustomerServiceContact } from "@/lib/customer-service";

export function PublicHeader() {
  return <nav className="landing-nav" aria-label="Primary navigation">
    <Link className="brand" href="/" aria-label="Nivora Core home"><span className="brand-mark"><i/></span><span>Nivora <b>Core</b></span></Link>
    <div><Link className="landing-sign-in" href="/login">Sign In</Link><Link className="button primary" href="/register">Get Started<ArrowRight size={16}/></Link></div>
  </nav>;
}

export function PublicFooter() {
  const customerService = getCustomerServiceContact();
  return <footer className="landing-footer">
    <div className="brand"><span className="brand-mark"><i/></span><span>Nivora <b>Core</b></span></div>
    <div className="landing-footer-links"><Link href="/#security">Security</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><a href={customerService.email ? `mailto:${customerService.email}` : customerService.lineUrl}>Customer Service</a></div>
    <PublicLanguageSelect/>
  </footer>;
}