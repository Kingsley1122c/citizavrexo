import { describe, expect, it } from "vitest";
import { CUSTOMER_SERVICE_LINE_URL, withdrawalSupportMessage } from "@/lib/customer-service-config";
import { userUi } from "@/lib/i18n/user-ui";

describe("customer service LINE", () => {
  it("uses the official LINE URL and safely renders withdrawal details", () => {
    const message = withdrawalSupportMessage(userUi("en").money.supportMessageTemplate, {
      reference: "NVW-123",
      amount: "$1,250.00",
      bankName: "Test Bank",
      accountName: "Test User",
      maskedAccountNumber: "****6789",
    });
    const url = new URL(CUSTOMER_SERVICE_LINE_URL);

    expect(CUSTOMER_SERVICE_LINE_URL).toBe("https://line.me/ti/p/wfRRjNqPzw");
    expect(url.origin).toBe("https://line.me");
    expect(url.pathname).toBe("/ti/p/wfRRjNqPzw");
    expect(message).toContain("Withdrawal reference: NVW-123");
    expect(message).toContain("Amount: $1,250.00");
    expect(message).toContain("Bank: Test Bank");
    expect(message).toContain("Account name: Test User");
    expect(message).toContain("Account number: ****6789");
    expect(message).not.toMatch(/password|pin|otp|recovery code|session token|secret/i);
  });
});