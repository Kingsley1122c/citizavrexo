import { describe, expect, it, vi } from "vitest";
import { userUi } from "@/lib/i18n/user-ui";
import { SUPPORTED_LOCALES } from "@/lib/i18n/config";
import { sendEventEmail } from "./email-service";

describe("event email service", () => {
  it("sends a shared event reference without accepting security secrets", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    await sendEventEmail({ send }, { to: "amara@example.test", locale: "en", event: "security_alert", eventReference: "SEC-92AH", displayName: "Amara", summary: "A new device was verified." }, "outbox/test-email");
    expect(send).toHaveBeenCalledOnce();
    const message = send.mock.calls[0][0];
    const email = userUi("en").email;
    expect(message.text).toContain("SEC-92AH");
    expect(message.subject).toBe(`${email.subjectPrefix} · ${email.subjects.security_alert}`);
    expect(message.html).toContain("SEC-92AH");
    expect(message.html).toContain("<meta name=\"viewport\"");
    expect(message).not.toHaveProperty("password");
    expect(message).not.toHaveProperty("token");
    expect(message).not.toHaveProperty("recoveryCode");
  });

  it("renders a dedicated welcome subject without including secrets", async () => {
    vi.stubEnv("APP_URL", "https://citizavrexo.com");
    const send = vi.fn().mockResolvedValue(undefined);
    await sendEventEmail({ send }, { to: "new@example.test", locale: "ja", event: "welcome", eventReference: "WELCOME-user", displayName: "New User", summary: "Your account is verified and ready." }, "outbox/welcome");
    const email = userUi("ja").email;
    expect(send.mock.calls[0][0]).toMatchObject({ subject: `${email.subjectPrefix} · ${email.subjects.welcome}`, idempotencyKey: "outbox/welcome" });
    expect(send.mock.calls[0][0].html).toContain("Your account is verified and ready.");
    expect(send.mock.calls[0][0].html).toContain(userUi("ja").app.nav.profile);
    expect(send.mock.calls[0][0].html).toContain(userUi("ja").app.nav.security);
    expect(send.mock.calls[0][0].html).toContain("https://citizavrexo.com/login");
    vi.unstubAllEnvs();
  });

  it("localizes email subject and wrapper labels for Traditional Chinese", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    await sendEventEmail({ send }, { to: "zh@example.test", locale: "zh-TW", event: "security_alert", eventReference: "SEC-TW", displayName: "User", summary: "Localized summary" }, "outbox/zh-tw");
    const message = send.mock.calls[0][0];
    const email = userUi("zh-TW").email;
    expect(message.subject).toBe(`${email.subjectPrefix} · ${email.subjects.security_alert}`);
    expect(message.text).toContain(`${email.reference}: SEC-TW`);
    expect(message.html).toContain(email.reference);
  });

  it("renders email subjects from every supported locale catalog", async () => {
    for (const locale of SUPPORTED_LOCALES) {
      const send = vi.fn().mockResolvedValue(undefined);
      await sendEventEmail({ send }, { to: `${locale.toLowerCase().replaceAll("-", ".")}@example.test`, locale, event: "security_alert", eventReference: `SEC-${locale}`, displayName: "Customer", summary: "Localized summary" }, `outbox/${locale}`);
      expect(send.mock.calls[0][0].subject).toBe(`${userUi(locale).email.subjectPrefix} · ${userUi(locale).email.subjects.security_alert}`);
    }
    for (const locale of ["ja", "ko", "zh-CN", "zh-TW"] as const) {
      expect(userUi(locale).email.subjects.security_alert).not.toBe(userUi("en").email.subjects.security_alert);
    }
  });
});
