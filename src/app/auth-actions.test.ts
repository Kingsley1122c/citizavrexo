import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("NEXT_REDIRECT"); }) }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ "x-real-ip": "203.0.113.4", "user-agent": "Registration Test Browser" })),
}));
vi.mock("@/lib/auth/rate-limit-service", () => ({
  clearAuthRateLimit: vi.fn(),
  consumeAuthRateLimit: vi.fn(() => true),
}));
vi.mock("@/lib/auth/session-service", () => ({
  revokeCurrentSession: vi.fn(),
}));
vi.mock("@/lib/notifications/resend-transport", () => ({
  isTransactionalEmailConfigured: vi.fn(() => true),
}));
vi.mock("@/lib/auth/auth-service", () => ({
  loginUser: vi.fn(),
  registerUser: vi.fn(),
  requestEmailVerification: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPasswordWithToken: vi.fn(),
  verifyRegisteredEmail: vi.fn(),
}));

import { registerAction, resendVerificationAction, resetAction, verifyEmailAction } from "./auth-actions";
import { registerUser, requestEmailVerification, requestPasswordReset, verifyRegisteredEmail } from "@/lib/auth/auth-service";
import { consumeAuthRateLimit } from "@/lib/auth/rate-limit-service";
import { redirect } from "next/navigation";
import { isTransactionalEmailConfigured } from "@/lib/notifications/resend-transport";

const validRegistration = () => {
  const formData = new FormData();
  formData.set("name", "Registration Test");
  formData.set("email", "registration@example.test");
  formData.set("password", "TestPassword!2026");
  formData.set("pin", "2468");
  formData.set("confirmation", "2468");
  formData.set("locale", "en");
  formData.set("currency", "USD");
  return formData;
};

describe("registerAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isTransactionalEmailConfigured).mockReturnValue(true);
  });

  it("requires a supported account currency", async () => {
    const formData = validRegistration();
    formData.delete("currency");

    await expect(registerAction({}, formData)).resolves.toEqual({
      error: "Use a valid name, email, password, and exactly 4-digit transaction PIN.",
    });
    expect(registerUser).not.toHaveBeenCalled();
  });

  it("rejects registration without a transaction PIN", async () => {
    const formData = validRegistration();
    formData.delete("pin");

    await expect(registerAction({}, formData)).resolves.toEqual({
      error: "Use a valid name, email, password, and exactly 4-digit transaction PIN.",
    });
    expect(registerUser).not.toHaveBeenCalled();
  });

  it("rejects invalid transaction PIN format", async () => {
    const formData = validRegistration();
    formData.set("pin", "12a4");

    await expect(registerAction({}, formData)).resolves.toEqual({
      error: "Use a valid name, email, password, and exactly 4-digit transaction PIN.",
    });
    expect(registerUser).not.toHaveBeenCalled();
  });

  it("rejects mismatched transaction PIN confirmation", async () => {
    const formData = validRegistration();
    formData.set("confirmation", "1357");

    await expect(registerAction({}, formData)).resolves.toEqual({
      error: "Transaction PINs do not match.",
    });
    expect(registerUser).not.toHaveBeenCalled();
  });

  it("keeps duplicate and unrelated registration failures non-enumerating", async () => {
    vi.mocked(registerUser).mockRejectedValueOnce(new Error("Email exists"));

    await expect(registerAction({}, validRegistration())).resolves.toEqual({
      error: "We couldn't confirm verification delivery. If your account is pending, request a new verification link.",
    });
  });

  it("reports acceptance only after the verification email is accepted", async () => {
    vi.mocked(registerUser).mockResolvedValueOnce(undefined);

    await expect(registerAction({}, validRegistration())).resolves.toEqual({ success: "Verification email accepted for delivery. Check your inbox to continue." });
    expect(registerUser).toHaveBeenCalledWith(expect.objectContaining({ email: "registration@example.test", currency: "USD", pin: "2468" }), {
      ipAddress: "203.0.113.4",
      userAgent: "Registration Test Browser",
    });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("accepts an 8-character password without composition requirements", async () => {
    const formData = validRegistration();
    formData.set("password", "abcdefgh");

    await expect(registerAction({}, formData)).resolves.toEqual({ success: "Verification email accepted for delivery. Check your inbox to continue." });
    expect(registerUser).toHaveBeenCalledWith(expect.objectContaining({ password: "abcdefgh" }), expect.any(Object));
  });

  it("rejects passwords shorter than 8 characters", async () => {
    const formData = validRegistration();
    formData.set("password", "abcdefg");

    await expect(registerAction({}, formData)).resolves.toEqual({ error: "Use a valid name, email, password, and exactly 4-digit transaction PIN." });
    expect(registerUser).not.toHaveBeenCalled();
  });

  it("does not create an account when email verification is unavailable", async () => {
    vi.mocked(isTransactionalEmailConfigured).mockReturnValueOnce(false);

    await expect(registerAction({}, validRegistration())).resolves.toEqual({ error: "Registration cannot currently be completed because email verification delivery is unavailable. No account was created." });
    expect(registerUser).not.toHaveBeenCalled();
  });

  it("preserves registration throttling", async () => {
    vi.mocked(consumeAuthRateLimit).mockReturnValueOnce(false);

    await expect(registerAction({}, validRegistration())).resolves.toEqual({ error: "Too many attempts. Please try again later." });
    expect(registerUser).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("resendVerificationAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isTransactionalEmailConfigured).mockReturnValue(true);
    vi.mocked(consumeAuthRateLimit).mockReturnValue(true);
  });

  it("rate limits both the target email and requester address before queuing", async () => {
    const formData = new FormData();
    formData.set("email", "Pending@Example.test");

    await expect(resendVerificationAction(formData)).rejects.toThrow("NEXT_REDIRECT");
    expect(consumeAuthRateLimit).toHaveBeenNthCalledWith(1, "email_verification", "email:Pending@Example.test");
    expect(consumeAuthRateLimit).toHaveBeenNthCalledWith(2, "email_verification", "ip:203.0.113.4");
    expect(requestEmailVerification).toHaveBeenCalledWith("Pending@Example.test");
    expect(redirect).toHaveBeenCalledWith("/verify-email?resend=requested");
  });

  it("returns the same generic result when resend is rate limited", async () => {
    vi.mocked(consumeAuthRateLimit).mockReturnValueOnce(false).mockReturnValueOnce(true);
    const formData = new FormData();
    formData.set("email", "pending@example.test");

    await expect(resendVerificationAction(formData)).rejects.toThrow("NEXT_REDIRECT");
    expect(requestEmailVerification).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/verify-email?resend=requested");
  });
});

describe("verifyEmailAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("consumes a validated token only after explicit form submission", async () => {
    const formData = new FormData();
    formData.set("token", "a".repeat(64));

    await expect(verifyEmailAction(formData)).rejects.toThrow("NEXT_REDIRECT");
    expect(verifyRegisteredEmail).toHaveBeenCalledWith("a".repeat(64));
    expect(redirect).toHaveBeenCalledWith("/verify-email?verified=success");
  });

  it("does not call verification for an invalid token", async () => {
    const formData = new FormData();
    formData.set("token", "short");

    await expect(verifyEmailAction(formData)).rejects.toThrow("NEXT_REDIRECT");
    expect(verifyRegisteredEmail).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/verify-email?verified=invalid");
  });
});

describe("resetAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isTransactionalEmailConfigured).mockReturnValue(true);
  });

  it("does not claim delivery when transactional email is unavailable", async () => {
    vi.mocked(isTransactionalEmailConfigured).mockReturnValueOnce(false);
    const formData = new FormData();
    formData.set("email", "registration@example.test");

    await expect(resetAction({}, formData)).resolves.toEqual({ error: "Email delivery is unavailable. No recovery email was sent." });
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });

  it("keeps accepted recovery requests non-enumerating", async () => {
    const formData = new FormData();
    formData.set("email", "registration@example.test");

    await expect(resetAction({}, formData)).resolves.toEqual({ success: "If an account matches that email, recovery instructions will be sent." });
    expect(requestPasswordReset).toHaveBeenCalledWith("registration@example.test");
  });
});