import { describe, expect, it, vi } from "vitest";
import { convertMinorAmount, divideDecimalRates } from "./decimal";
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
    expect(String(fetcher.mock.calls[0][0])).not.toContain("symbols=");
    expect(String(fetcher.mock.calls[0][0])).not.toContain("test-app-id".replace("test", "missing"));
  });

  it("reuses one complete latest snapshot for an hour and refreshes after expiry", async () => {
    let now = 1_800_000_000_000;
    const fetcher = vi.fn().mockImplementation(async () => response({ base: "USD", timestamp: 1_800_000_000, rates: { USD: 1, EUR: 0.9, GBP: 0.8, JPY: 150 } }));
    const provider = new OpenExchangeRatesProvider({ appId: "test-app-id", fetcher, now: () => now });

    const [eurToGbp, jpyToEur] = await Promise.all([
      provider.getRate({ fromCurrency: "EUR", toCurrency: "GBP" }),
      provider.getRate({ fromCurrency: "JPY", toCurrency: "EUR" }),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(eurToGbp.rate).toBe("0.888888888888888889");
    expect(jpyToEur.rate).toBe("0.006");

    now += 60 * 60_000;
    await provider.getRate({ fromCurrency: "USD", toCurrency: "GBP" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not cache an invalid latest response", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ base: "EUR", timestamp: 1_800_000_000, rates: { GBP: 0.8 } }))
      .mockResolvedValueOnce(response({ base: "USD", timestamp: 1_800_000_000, rates: { GBP: 0.8 } }));
    const provider = new OpenExchangeRatesProvider({ appId: "test-app-id", fetcher });

    await expect(provider.getRate({ fromCurrency: "USD", toCurrency: "GBP" })).rejects.toMatchObject({ code: "invalid_response" });
    await expect(provider.getRate({ fromCurrency: "USD", toCurrency: "GBP" })).resolves.toMatchObject({ rate: "0.8" });
    expect(fetcher).toHaveBeenCalledTimes(2);
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

  it("times out fail-closed without exposing its credential in logs or errors", async () => {
    const appId = "credential-must-remain-server-only";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetcher = vi.fn((_input: URL | RequestInfo, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }));
    const provider = new OpenExchangeRatesProvider({ appId, timeoutMs: 1, fetcher });

    const failure = await provider.getRate({ fromCurrency: "USD", toCurrency: "EUR" }).catch((error: unknown) => error);

    expect(failure).toMatchObject({ code: "unavailable" });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(appId);
    expect(String(failure)).not.toContain(appId);
    consoleError.mockRestore();
  });
});

describe("currency-aware integer conversion", () => {
  it("rounds once into the target currency minor unit", () => {
    expect(convertMinorAmount(100_000, "USD", "GBP", "0.79")).toBe(79_000);
    expect(convertMinorAmount(100_000, "USD", "JPY", "149.55")).toBe(149_550);
    expect(convertMinorAmount(1_000, "KWD", "USD", "3.25")).toBe(325);
    expect(convertMinorAmount(1, "USD", "JPY", "50")).toBe(1);
  });

  it("derives directional cross-rates with stable decimal precision", () => {
    expect(divideDecimalRates("1", "3")).toBe("0.333333333333333333");
    expect(divideDecimalRates("3", "1")).toBe("3");
  });
});
