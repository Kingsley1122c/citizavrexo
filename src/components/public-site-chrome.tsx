import Link from "next/link";
import { ArrowRight, MessageCircle, MessagesSquare } from "lucide-react";
import { PublicLanguageSelect } from "@/components/public-language-select";
import { BrandLogo } from "@/components/brand-logo";
import { getCustomerServiceContact } from "@/lib/customer-service";

export function PublicHeader() {
  return <nav className="landing-nav" aria-label="Primary navigation">
    <Link className="brand" href="/" aria-label="Citizavrexo home"><BrandLogo tone="light"/></Link>
    <div><Link className="landing-sign-in" href="/login">Sign In</Link><Link className="button primary" href="/register">Get Started<ArrowRight size={16}/></Link></div>
  </nav>;
}

export function PublicFooter() {
  const customerService = getCustomerServiceContact();
  return <footer className="landing-footer">
    <div className="brand"><BrandLogo tone="dark"/></div>
    <div className="landing-footer-links"><Link href="/#security">Security</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><a href={customerService.whatsappUrl} target="_blank" rel="noreferrer"><MessageCircle size={16}/>WhatsApp</a><a href={customerService.lineUrl} target="_blank" rel="noreferrer"><MessagesSquare size={16}/>LINE</a></div>
    <PublicLanguageSelect/>
  </footer>;
}
