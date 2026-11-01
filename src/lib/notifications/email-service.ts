import "server-only";

import { z } from "zod";
import { SUPPORTED_LOCALES } from "@/lib/i18n/config";
import { getUserUiCatalog } from "@/lib/i18n/locales/user-ui";
import { getApplicationUrl } from "./resend-transport";

export type EmailEvent = "welcome"|"transaction_completed"|"transaction_pending"|"transaction_failed"|"security_alert"|"password_changed"|"new_device_login"|"account_recovery"|"important_account_notification"|"admin_message";
export type EmailAction = { kind: "verify_email" | "reset_password"; tokenId: string };
const emailAddress = z.string().email().max(254);
const displayName = z.string().min(1).max(100).regex(/^[^\p{Cc}\p{Cf}]+$/u);
const eventReference = z.string().min(1).max(160);
const standardEmailPayloadSchema = z.object({ to: emailAddress, locale: z.enum(SUPPORTED_LOCALES), event: z.enum(["welcome", "transaction_completed", "transaction_pending", "transaction_failed", "security_alert", "password_changed", "new_device_login", "account_recovery", "important_account_notification"]), eventReference, displayName, summary: z.string().min(1).max(500).regex(/^[^\p{Cc}\p{Cf}]+$/u), action: z.object({ kind: z.enum(["verify_email", "reset_password"]), tokenId: z.string().uuid() }).strict().optional() }).strict();
export const adminMessagePayloadSchema = z.object({ to: emailAddress, locale: z.enum(SUPPORTED_LOCALES), event: z.literal("admin_message"), eventReference, displayName, subject: z.string().min(1).max(120).regex(/^[^\p{Cc}\p{Cf}]+$/u), message: z.string().min(1).max(4000).refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value.replace(/[\n\r\t]/g, ""))) }).strict();
export const safeEmailPayloadSchema = z.discriminatedUnion("event", [standardEmailPayloadSchema, adminMessagePayloadSchema]);
export type SafeEmailPayload = z.infer<typeof safeEmailPayloadSchema>;
export interface EmailTransport { send(message:{to:string;subject:string;text:string;html?:string;idempotencyKey:string}):Promise<void>; }
const escapeHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

export async function sendEventEmail(transport:EmailTransport,payload:SafeEmailPayload,idempotencyKey:string,actionUrl?:string) {
  const validated = safeEmailPayloadSchema.parse(payload);
  if (validated.event === "admin_message") {
    if (actionUrl) throw new Error("Admin messages cannot contain authentication actions.");
    const loginUrl = `${getApplicationUrl()}/login?returnTo=/app`;
    const paragraphs = validated.message.split(/\r?\n/).map((line) => line.trim() ? `<p style="margin:0 0 14px;color:#465761;line-height:1.7">${escapeHtml(line)}</p>` : '<div style="height:8px"></div>').join("");
    const text = `CITIZAVREXO\nBanking made beautifully simple.\n\n${validated.subject}\n\nHello ${validated.displayName},\n\n${validated.message}\n\nOpen CITIZAVREXO: ${loginUrl}`;
    const html = `<!doctype html><html lang="${escapeHtml(validated.locale)}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;background:#f5f8fa;color:#10202a;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:32px 14px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:auto;background:#ffffff;border:1px solid #dfe7eb;border-radius:8px;overflow:hidden"><tr><td style="padding:22px 28px;background:#0b1720;color:#ffffff"><p style="margin:0;font-size:17px;font-weight:800">Citizavrexo</p><p style="margin:6px 0 0;color:#b8c6cc;font-size:12px">Banking made beautifully simple.</p></td></tr><tr><td style="padding:32px 28px"><p style="margin:0 0 8px;color:#078f80;font-size:10px;font-weight:800;text-transform:uppercase">MESSAGE FROM CITIZAVREXO</p><h1 style="margin:0 0 20px;color:#10202a;font-size:27px;line-height:1.25">${escapeHtml(validated.subject)}</h1><p style="margin:0 0 18px;line-height:1.65">Hello ${escapeHtml(validated.displayName)},</p>${paragraphs}<a href="${escapeHtml(loginUrl)}" style="display:inline-block;background:#11c8b0;color:#062d2a;text-decoration:none;padding:13px 20px;border-radius:6px;font-size:14px;font-weight:800;margin:8px 0 4px">Open CITIZAVREXO</a><p style="margin:24px 0 0;padding-top:20px;border-top:1px solid #dfe7eb;color:#71808a;font-size:12px;line-height:1.65">For your security, this link opens the normal CITIZAVREXO sign-in page. Never share your password, Transaction PIN, recovery codes, or session details.</p></td></tr><tr><td style="padding:18px 28px;background:#111f28;color:#91a1aa;font-size:11px">CITIZAVREXO · Banking made beautifully simple.</td></tr></table></td></tr></table></body></html>`;
    await transport.send({ to: validated.to, subject: `CITIZAVREXO · ${validated.subject}`, text, html, idempotencyKey });
    return;
  }
  const catalog = getUserUiCatalog(validated.locale);
  const email = catalog.email;
  if (Boolean(validated.action) !== Boolean(actionUrl)) throw new Error("Email action configuration is invalid.");
  const actionText=actionUrl ? `\n\n${email.continueSecurely}: ${actionUrl}` : "";
  const text=`${email.hello} ${validated.displayName},\n\n${validated.summary}${actionText}\n\n${email.reference}: ${validated.eventReference}\n\n${email.securityNote}`;
  const subject=validated.action ? email.actionSubjects[validated.action.kind] : email.subjects[validated.event];
  const welcome = validated.event === "welcome";
  const primaryUrl = actionUrl ?? (welcome && process.env.APP_URL ? `${getApplicationUrl()}/login` : undefined);
  const actionLabel = welcome && validated.locale === "en" ? "Open CITIZAVREXO" : email.continueSecurely;
  const actionButton = primaryUrl ? `<a href="${escapeHtml(primaryUrl)}" style="display:inline-block;background:#11c8b0;color:#062d2a;text-decoration:none;padding:13px 20px;border-radius:6px;font-size:14px;font-weight:800;margin:4px 0 22px">${escapeHtml(actionLabel)}</a>` : "";
  const welcomeSteps = welcome ? `<div style="margin:22px 0;padding:18px 20px;background:#f5f8fa;border:1px solid #dfe7eb;border-radius:8px"><p style="margin:0 0 12px;color:#71808a;font-size:11px;font-weight:800;text-transform:uppercase">${escapeHtml(catalog.auth.marketingTitleLine1)} ${escapeHtml(catalog.auth.marketingTitleLine2)}</p><ol style="margin:0;padding-left:20px;color:#10202a;line-height:1.9"><li>${escapeHtml(catalog.app.nav.profile)}</li><li>${escapeHtml(catalog.app.nav.security)}</li><li>${escapeHtml(catalog.app.nav.accounts)}</li><li>${escapeHtml(catalog.cardRequest.request)}</li></ol></div>` : "";
  const html = `<!doctype html><html lang="${escapeHtml(validated.locale)}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;background:#f5f8fa;color:#10202a;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:32px 14px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:auto;background:#ffffff;border:1px solid #dfe7eb;border-radius:8px;overflow:hidden"><tr><td style="padding:22px 28px;background:#0b1720;color:#ffffff"><p style="margin:0;font-size:17px;font-weight:800">Citizavrexo</p></td></tr><tr><td style="padding:32px 28px"><p style="margin:0 0 8px;color:#078f80;font-size:10px;font-weight:800;text-transform:uppercase">${escapeHtml(email.brand)}</p><h1 style="margin:0 0 20px;color:#10202a;font-size:27px;line-height:1.25">${escapeHtml(subject)}</h1><p style="margin:0 0 12px;line-height:1.65">${escapeHtml(email.hello)} ${escapeHtml(validated.displayName)},</p><p style="margin:0 0 18px;color:#465761;line-height:1.7">${escapeHtml(validated.summary)}</p>${welcomeSteps}${actionButton}<div style="padding:14px 16px;background:#f5f8fa;border-left:3px solid #11c8b0"><p style="margin:0;color:#71808a;font-size:12px">${escapeHtml(email.reference)}</p><p style="margin:4px 0 0;color:#10202a;font-family:monospace;font-size:13px;overflow-wrap:anywhere">${escapeHtml(validated.eventReference)}</p></div><p style="margin:24px 0 0;padding-top:20px;border-top:1px solid #dfe7eb;color:#71808a;font-size:12px;line-height:1.65">${escapeHtml(email.securityNote)}</p></td></tr><tr><td style="padding:18px 28px;background:#111f28;color:#91a1aa;font-size:11px">CITIZAVREXO · ${escapeHtml(email.brand)}</td></tr></table></td></tr></table></body></html>`;
  await transport.send({to:validated.to,subject:`${email.subjectPrefix} · ${subject}`,text,html,idempotencyKey});
}
