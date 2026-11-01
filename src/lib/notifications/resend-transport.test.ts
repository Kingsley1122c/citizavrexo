import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.hoisted(() => vi.fn());
const consumeAuthRateLimit = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));
vi.mock("@/lib/auth/rate-limit-service", () => ({ consumeAuthRateLimit }));

import { DailyEmailLimitError, getApplicationUrl, isTransactionalEmailConfigured, resendEmailTransport } from "./resend-transport";

const message = {
  to: "recipient@example.test",
  subject: "CITIZAVREXO test",
  text: "Safe transactional content.",
  idempotencyKey: "outbox/test-message",
};

describe("Resend email transport", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "test-resend-key");
    vi.stubEnv("EMAIL_FROM", "CITIZAVREXO <no-reply@citizavrexo.com>");
    vi.stubEnv("APP_URL", "https://citizavrexo.com");
    vi.stubEnv("RECOVERY_CODE_PEPPER", "test-only-recovery-pepper-at-least-32-characters");
    send.mockReset();
    consumeAuthRateLimit.mockReset();
    consumeAuthRateLimit.mockReturnValue(true);
  });

  afterEach(() => vi.unstubAllEnvs());

  it("requires action-token signing before reporting email readiness", () => {
    expect(isTransactionalEmailConfigured()).toBe(true);
    vi.stubEnv("RECOVERY_CODE_PEPPER", "too-short");
    expect(isTransactionalEmailConfigured()).toBe(false);
  });

  it("uses the canonical Citizavrexo origin in production even when APP_URL is stale", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "https://citizavrexo.onrender.com");
    expect(getApplicationUrl()).toBe("https://citizavrexo.com");
  });

  it("uses the canonical production origin for administrator transfer links", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "https://citizavrexo.onrender.com");
    const transport = vi.spyOn(resendEmailTransport, "send").mockResolvedValueOnce();
    const { deliverAdministratorTransferVerification } = await import("./administrator-transfer-delivery");

    await deliverAdministratorTransferVerification({ recipient: "owner@example.test", verificationToken: "transfer-token", expiresAt: "2026-11-01T12:30:00.000Z" });

    expect(transport).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining("https://citizavrexo.com/admin-transfer?token=transfer-token") }));
  });

  it("uses the configured sender and provider idempotency key", async () => {
    send.mockResolvedValueOnce({ data: { id: "provider-message-id" }, error: null });
    await resendEmailTransport.send(message);

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ from: "CITIZAVREXO <no-reply@citizavrexo.com>", to: message.to, subject: message.subject, text: message.text }),
      { idempotencyKey: message.idempotencyKey },
    );
    expect(consumeAuthRateLimit).toHaveBeenCalledWith("email_delivery", "global");
  });

  it("does not call Resend when the shared daily delivery budget is exhausted", async () => {
    consumeAuthRateLimit.mockReturnValueOnce(false);

    await expect(resendEmailTransport.send(message)).rejects.toBeInstanceOf(DailyEmailLimitError);
    expect(send).not.toHaveBeenCalled();
  });

  it("fails closed without exposing provider details when Resend rejects a message", async () => {
    send.mockResolvedValueOnce({ data: null, error: { name: "validation_error", message: "sensitive provider detail" } });

    const failure = await resendEmailTransport.send(message).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe("Transactional email provider rejected the message.");
  });
});

