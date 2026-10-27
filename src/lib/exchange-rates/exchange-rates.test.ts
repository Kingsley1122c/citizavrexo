import { describe, expect, it, vi } from "vitest";
import { convertMinorAmount } from "./decimal";
import { OpenExchangeRatesProvider } from "./open-exchange-rates-provider";
import { getExchangeRateProvider } from "./provider";

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("Open Exchange Rates provider", () => {
  it("derives a broad non-USD pair from provider-backed USD rates", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ base: "USD", timestamp: 1_757_894_400, rates: { INR: 83.25, SGD: 1.332 } }));
    const provider = new OpenExchangeRatesProvider({ appId: "test-app-id", fetcher });
    const rate = await provider.getRate({ fromCurrency: "INR", toCurrency: "SGD" });
    expect(rate).toMatchObject({ fromCurrency: "INR", toCurrency: "SGD", effectiveDate: "2025-09-15", publishedAt: "2025-09-15T00:00:00.000Z", provider: "open_exchange_rates" });
    expect(Number(rate.rate)).toBeCloseTo(1.332 / 83.25, 15);
    expect(String(fetcher.mock.calls[0][0])).toContain("symbols=INR%2CSGD%2CUSD");
    expect(String(fetcher.mock.calls[0][0])).not.toContain("test-app-id".replace("test", "missing"));
  });

  it("uses the historical endpoint and preserves the requested UTC date", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ base: "USD", timestamp: 1_757_894_400, rates: { USD: 1, GBP: 0.79 } }));
    const provider = new OpenExchangeRatesProvider({ appId: "test-app-id", fetcher });
    const rate = await provider.getRate({ fromCurrency: "USD", toCurrency: "GBP", date: "2025-09-15" });
    expect(rate).toMatchObject({ rate: "0.79", effectiveDate: "2025-09-15" });
    expect(String(fetcher.mock.calls[0][0])).toContain("historical/2025-09-15.json");
  });

  it("fails closed for unavailable pairs, provider errors, and missing configuration", async () => {
    const missingPair = new OpenExchangeRatesProvider({ appId: "test", fetcher: vi.fn().mockResolvedValue(response({ base: "USD", timestamp: 1_757_894_400, rates: { USD: 1 } })) });
    await expect(missingPair.getRate({ fromCurrency: "USD", toCurrency: "GBP" })).rejects.toMatchObject({ code: "unsupported" });
    const failed = new OpenExchangeRatesProvider({ appId: "test", fetcher: vi.fn().mockResolvedValue(response({ error: true }, 429)) });
    await expect(failed.getRate({ fromCurrency: "USD", toCurrency: "JPY" })).rejects.toMatchObject({ code: "unavailable" });
    expect(() => getExchangeRateProvider({})).toThrow("not currently available");
  });
});

describe("currency-aware integer conversion", () => {
  it("rounds once into the target currency minor unit", () => {
    expect(convertMinorAmount(100_000, "USD", "GBP", "0.79")).toBe(79_000);
    expect(convertMinorAmount(100_000, "USD", "JPY", "149.55")).toBe(149_550);
    expect(convertMinorAmount(1_000, "KWD", "USD", "3.25")).toBe(325);
  });
});