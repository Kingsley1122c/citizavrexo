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
vi.mock("@/lib/auth/auth-service", () => ({
  loginUser: vi.fn(),
  registerUser: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPasswordWithToken: vi.fn(),
}));

import { registerAction } from "./auth-actions";
import { registerUser } from "@/lib/auth/auth-service";
import { consumeAuthRateLimit } from "@/lib/auth/rate-limit-service";
import { redirect } from "next/navigation";

const validRegistration = () => {
  const formData = new FormData();
  formData.set("name", "Registration Test");
  formData.set("email", "registration@example.test");
  formData.set("password", "TestPassword!2026");
  formData.set("locale", "en");
  formData.set("currency", "USD");
  return formData;
};

describe("registerAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires a supported account currency", async () => {
    const formData = validRegistration();
    formData.delete("currency");

    await expect(registerAction({}, formData)).resolves.toEqual({
      error: "Use a valid name, email, and a password of at least 12 characters.",
    });
    expect(registerUser).not.toHaveBeenCalled();
  });

  it("keeps duplicate and unrelated registration failures non-enumerating", async () => {
    vi.mocked(registerUser).mockRejectedValueOnce(new Error("Email exists"));

    await expect(registerAction({}, validRegistration())).resolves.toEqual({
      error: "We couldn't create that account. Please try again.",
    });
  });

  it("creates the account with request metadata and redirects directly to the app", async () => {
    vi.mocked(registerUser).mockResolvedValueOnce(undefined);

    await expect(registerAction({}, validRegistration())).rejects.toThrow("NEXT_REDIRECT");
    expect(registerUser).toHaveBeenCalledWith(expect.objectContaining({ email: "registration@example.test", currency: "USD" }), {
      ipAddress: "203.0.113.4",
      userAgent: "Registration Test Browser",
    });
    expect(redirect).toHaveBeenCalledWith("/app");
    expect(redirect).not.toHaveBeenCalledWith(expect.stringContaining("verify-email"));
  });

  it("preserves registration throttling", async () => {
    vi.mocked(consumeAuthRateLimit).mockReturnValueOnce(false);

    await expect(registerAction({}, validRegistration())).resolves.toEqual({ error: "Too many attempts. Please try again later." });
    expect(registerUser).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});