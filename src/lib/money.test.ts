import { describe, expect, it } from "vitest";
import { currencyFractionDigits, formatCurrency } from "./currency";
import { parseMajorAmountToMinor } from "./money";

describe("major currency amount parsing", () => {
  it.each([
    ["1", 100],
    ["1.2", 120],
    ["1.23", 123],
    ["0.01", 1],
    [" 2500.50 ", 250_050],
  ])("converts %s exactly to minor units", (value, expected) => {
    expect(parseMajorAmountToMinor(value)).toBe(expected);
  });

  it.each(["", "0", "0.00", "-1", "+1", "1.234", "1e3", "1,000", "abc", "90071992547410.00"])("rejects invalid amount %s", (value) => {
    expect(parseMajorAmountToMinor(value)).toBeNull();
  });

  it("uses two USD fraction digits", () => {
    expect(parseMajorAmountToMinor("2500", "USD")).toBe(250_000);
    expect(parseMajorAmountToMinor("2500.500", "USD")).toBeNull();
    expect(parseMajorAmountToMinor("2500.50", "USD")).toBe(250_050);
  });

  it("formats USD with the narrow dollar symbol", () => {
    expect(formatCurrency(1250, "USD", "en-US")).toBe("$1,250.00 USD");
  });

  it("uses deterministic ISO fraction digits across runtimes", () => {
    expect(currencyFractionDigits("JPY")).toBe(0);
    expect(currencyFractionDigits("KWD")).toBe(3);
    expect(currencyFractionDigits("IDR")).toBe(2);
    expect(formatCurrency(10_000, "IDR", "en-US")).toContain("10,000.00");
  });
});
