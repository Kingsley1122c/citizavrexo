import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "./config";
import { financialEventCopy } from "./financial-events";

describe("localized financial events", () => {
  it.each(SUPPORTED_LOCALES)("keeps transfer amounts, counterparties, currencies, and review details in %s", (locale) => {
    const copy = financialEventCopy(locale);
    const sent = copy.transferSent("$12.34 USD", "Recipient Name", "¥1,900 JPY");
    const received = copy.transferReceived("¥1,900 JPY", "Sender Name", "$12.34 USD");
    const approved = copy.currencyApproved("KWD");
    const rejected = copy.currencyRejected("Eligibility changed");

    for (const title of [copy.transferSentTitle, copy.transferReceivedTitle, copy.currencyApprovedTitle, copy.currencyRejectedTitle]) {
      expect(title.trim().length).toBeGreaterThan(0);
    }
    expect(sent).toContain("$12.34 USD");
    expect(sent).toContain("¥1,900 JPY");
    expect(sent).toContain("Recipient Name");
    expect(received).toContain("$12.34 USD");
    expect(received).toContain("¥1,900 JPY");
    expect(received).toContain("Sender Name");
    expect(approved).toContain("KWD");
    expect(rejected).toContain("Eligibility changed");
  });
});