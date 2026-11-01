import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { getCustomerServiceContact } from "@/lib/customer-service";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How CITIZAVREXO handles account, profile, activity, and security information.",
};

export default function PrivacyPage() {
  const customerService = getCustomerServiceContact();
  return <LegalPage eyebrow="PRIVACY" title="Privacy Policy" introduction="This policy explains the information CITIZAVREXO handles when you use its financial account-management workspace.">
    <section><h2>Platform scope</h2><p>CITIZAVREXO manages application records for accounts, activity, profile review, physical-card requests, withdrawals, notifications, and security. It is not a licensed bank, payment processor, card issuer, or identity-verification provider, and it does not connect to real banking rails.</p></section>
    <section><h2>Information you provide</h2><p>We process information you submit when creating or managing an account, including your name, email address, profile details, contact information, residential information, and any bank-destination details used for withdrawal requests.</p></section>
    <section><h2>Account and activity information</h2><p>We maintain application-managed account balances, transaction and withdrawal records, physical-card requests, profile-review decisions, notifications, support references, and administrative audit events needed to operate the platform.</p></section>
    <section><h2>Device and security information</h2><p>We process session, trusted-device, login, account-recovery, and security-event information to authenticate access, protect accounts, investigate misuse, and maintain an audit trail. Passwords are stored as one-way hashes, and sensitive action tokens are time-limited.</p></section>
    <section><h2>How information is used</h2><p>Information is used to provide requested features, verify authorization, maintain accurate records, deliver service and security communications, prevent abuse, support account recovery, and meet operational and security obligations.</p></section>
    <section><h2>Security and communications</h2><p>CITIZAVREXO uses access controls, secure sessions, encryption in transit, server-side validation, audit records, and restricted administrative permissions. We may send transactional email and in-app notifications about account activity, security, profile reviews, requests, and ownership transfers.</p></section>
    <section><h2>Retention</h2><p>Information is retained while needed to provide the service, secure accounts, preserve required operational and audit records, resolve disputes, and enforce platform terms. Retention periods may differ by record type and operational need.</p></section>
    <section><h2>Your choices and contact</h2><p>You may review or update supported profile information in your account and request assistance concerning your information. For privacy or account questions, contact Customer Service through <a href={customerService.whatsappUrl} target="_blank" rel="noreferrer">WhatsApp ({customerService.whatsappNumber})</a> or <a href={customerService.lineUrl} target="_blank" rel="noreferrer">LINE</a>.</p></section>
  </LegalPage>;
}
