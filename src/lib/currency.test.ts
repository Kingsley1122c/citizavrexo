import { describe, expect, it } from "vitest";
import { currencyFlag, currencyInputStep, currencyName, currencySymbol, SUPPORTED_CURRENCIES } from "@/lib/currency";

describe("currency presentation", () => {
  it("provides display details for every supported currency", () => {
    for (const currency of SUPPORTED_CURRENCIES) {
      expect(currencyName(currency)).toBeTruthy();
      expect(currencySymbol(currency)).toBeTruthy();
    }
  });

  it("only associates currencies with intentional regional flags", () => {
    expect(currencyFlag("USD")).toBe("🇺🇸");
    expect(currencyFlag("EUR")).toBe("🇪🇺");
    expect(currencyFlag("XCD")).toBeUndefined();
  });

  it("uses each ledger currency's minor-unit precision for amount inputs", () => {
    expect(currencyInputStep("USD")).toBe("0.01");
    expect(currencyInputStep("EUR")).toBe("0.01");
    expect(currencyInputStep("JPY")).toBe("1");
    expect(currencyInputStep("KRW")).toBe("1");
    expect(currencyInputStep("TWD")).toBe("0.01");
    expect(currencyInputStep("KWD")).toBe("0.001");
  });
});