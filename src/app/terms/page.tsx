import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { getCustomerServiceContact } from "@/lib/customer-service";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms governing access to and use of the CITIZAVREXO platform.",
};

export default function TermsPage() {
  const customerService = getCustomerServiceContact();
  return <LegalPage eyebrow="TERMS" title="Terms of Service" introduction="These terms govern access to and use of the CITIZAVREXO financial account-management workspace.">
    <section><h2>Platform scope</h2><p>CITIZAVREXO provides application-managed account, transaction, profile, request, notification, and security records. It is not a licensed bank, payment processor, card issuer, or identity-verification provider, and displayed records do not represent access to real banking rails.</p></section>
    <section><h2>Acceptable use</h2><p>You may use the platform only for lawful purposes and through an account you are authorized to access. You must provide accurate information and follow the controls and review processes presented in the application.</p></section>
    <section><h2>Account responsibility</h2><p>You are responsible for safeguarding your password, recovery material, email account, and active sessions. Notify Customer Service promptly if you suspect unauthorized access, and do not share credentials or attempt to bypass account controls.</p></section>
    <section><h2>Platform functionality and records</h2><p>Features may include account and activity views, application-managed transactions, profile review, physical-card requests, withdrawals, notifications, and administrative actions. Records reflect activity within CITIZAVREXO and should be reviewed for accuracy.</p></section>
    <section><h2>Prohibited misuse</h2><p>You must not use CITIZAVREXO to misrepresent identity or authority, interfere with service operation, probe or bypass security, access another user&apos;s information, submit unlawful content, automate abusive requests, or manipulate platform records.</p></section>
    <section><h2>Suspension and termination</h2><p>Access may be restricted, suspended, or terminated when needed to protect users or the service, investigate misuse, enforce these terms, or respond to operational or security risks. Relevant records may be retained as described in the Privacy Policy.</p></section>
    <section><h2>Availability and changes</h2><p>We aim to keep the service available and accurate, but maintenance, provider outages, security events, or other operational conditions may interrupt access. Features or these terms may change when reasonably necessary, with updated terms published on this page.</p></section>
    <section><h2>Limitations</h2><p>To the extent permitted by applicable law, CITIZAVREXO is provided without guarantees of uninterrupted availability or suitability for a particular purpose. The platform operator is not responsible for losses caused by unauthorized credential use, third-party services, or events outside reasonable operational control.</p></section>
    <section><h2>Contact</h2><p>Questions about these terms or account access may be directed to Customer Service through <a href={customerService.whatsappUrl} target="_blank" rel="noreferrer">WhatsApp ({customerService.whatsappNumber})</a> or <a href={customerService.lineUrl} target="_blank" rel="noreferrer">LINE</a>.</p></section>
  </LegalPage>;
}
