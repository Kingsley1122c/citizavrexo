import { describe, expect, it } from "vitest";
import { generateRecoveryCodes, verifyRecoveryCode } from "./recovery-codes";

describe("recovery codes", () => {
  it("generates unique codes and stores only hashes", () => {
    const batch = generateRecoveryCodes();
    expect(batch.plainText).toHaveLength(10);
    expect(new Set(batch.plainText).size).toBe(10);
    expect(batch.stored.every((item, index) => item.hash !== batch.plainText[index])).toBe(true);
  });

  it("accepts a matching unused code and rejects used or incorrect codes", () => {
    const batch = generateRecoveryCodes(1);
    expect(verifyRecoveryCode(batch.plainText[0], batch.stored[0])).toBe(true);
    expect(verifyRecoveryCode("00000000-00000000", batch.stored[0])).toBe(false);
    expect(verifyRecoveryCode(batch.plainText[0], { ...batch.stored[0], usedAt: new Date().toISOString() })).toBe(false);
  });
});