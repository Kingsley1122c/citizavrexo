import { describe, expect, it, vi } from "vitest";

const { getRate } = vi.hoisted(() => ({ getRate: vi.fn() }));

vi.mock("./provider", () => ({
  getExchangeRateProvider: () => ({ id: "open_exchange_rates", getRate }),
}));

import { DEMONSTRATION_CURRENCIES, verifyLiveExchangeRates } from "./live-verification";

describe("live exchange-rate verification", () => {
  it("checks all 16 currencies and reciprocals once per deployment without financial writes", async () => {
    vi.stubEnv("EXCHANGE_RATE_MAX_AGE_SECONDS", "21600");
    const publishedAt = "2026-11-01T10:00:00.000Z";
    const usdRates = Object.fromEntries(DEMONSTRATION_CURRENCIES.map((currency, index) => [currency, index + 1])) as Record<string, number>;
    getRate.mockImplementation(async ({ fromCurrency, toCurrency }: { fromCurrency: string; toCurrency: string }) => ({
      fromCurrency,
      toCurrency,
      rate: String(usdRates[toCurrency] / usdRates[fromCurrency]),
      effectiveDate: "2026-11-01",
      publishedAt,
      provider: "open_exchange_rates",
    }));

    const first = await verifyLiveExchangeRates(new Date("2026-11-01T11:00:00.000Z"));
    const second = await verifyLiveExchangeRates(new Date("2026-11-01T11:30:00.000Z"));

    expect(first).toEqual(second);
    expect(first).toMatchObject({ status: "ok", provider: "open_exchange_rates", currencyCount: 16, publishedAt, ageSeconds: 3_600, maxAgeSeconds: 21_600, providerUpdateCadenceSeconds: 3_600, cacheTtlSeconds: 3_600, quoteExpirySeconds: 300, reciprocalAccuracy: true, simulatedOnly: true });
    expect(first.currencies).toEqual(DEMONSTRATION_CURRENCIES);
    expect(getRate).toHaveBeenCalledTimes(30);
    vi.unstubAllEnvs();
  });
});