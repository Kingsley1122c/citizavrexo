import { describe, expect, it } from "vitest";
import { isRecoveryCodePepperConfigured, requireRecoveryCodePepper } from "./runtime-secrets";

describe("runtime secret validation", () => {
  it("accepts only recovery peppers with at least 32 characters", () => {
    expect(isRecoveryCodePepperConfigured({ RECOVERY_CODE_PEPPER: "x".repeat(32) })).toBe(true);
    expect(isRecoveryCodePepperConfigured({ RECOVERY_CODE_PEPPER: "x".repeat(31) })).toBe(false);
    expect(isRecoveryCodePepperConfigured({})).toBe(false);
  });

  it("fails startup validation without exposing the configured value", () => {
    expect(() => requireRecoveryCodePepper({ RECOVERY_CODE_PEPPER: "sensitive-short-value" })).toThrow("RECOVERY_CODE_PEPPER must contain at least 32 characters.");
  });
});