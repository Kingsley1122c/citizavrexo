import { describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  resendVerificationAction: vi.fn(),
  verifyEmailAction: vi.fn(),
}));

vi.mock("@/app/auth-actions", () => actions);

import VerifyEmailPage from "./page";

describe("VerifyEmailPage", () => {
  it("renders a confirmation without consuming the token during GET", async () => {
    const page = await VerifyEmailPage({ searchParams: Promise.resolve({ token: "a".repeat(64) }) });

    expect(page).toBeTruthy();
    expect(actions.verifyEmailAction).not.toHaveBeenCalled();
  });
});