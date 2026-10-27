import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ db: {} }));

describe("account number generation", () => {
  it("returns an exactly ten-digit server-generated number", async () => {
    const { generateAccountNumber } = await import("./account-number");
    expect(generateAccountNumber(() => false, () => 1_234_567_890)).toBe("1234567890");
  });

  it("retries collisions without returning a duplicate", async () => {
    const { generateAccountNumber } = await import("./account-number");
    const candidates = [1_234_567_890, 1_234_567_890, 9_876_543_210];
    const nextNumber = vi.fn(() => candidates.shift()!);
    expect(generateAccountNumber((number) => number === "1234567890", nextNumber)).toBe("9876543210");
    expect(nextNumber).toHaveBeenCalledTimes(3);
  });

  it("rejects an invalid generator result", async () => {
    const { generateAccountNumber } = await import("./account-number");
    expect(() => generateAccountNumber(() => false, () => 123)).toThrow("generation failed");
  });
});