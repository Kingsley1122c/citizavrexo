import "server-only";

import { isSupportedCurrency } from "@/lib/currency";
import { divideDecimalRates } from "./decimal";
import type { ExchangeRateProvider, ExchangeRateRequest, ExchangeRateSnapshot } from "./types";
import { ExchangeRateError } from "./types";

type ProviderPayload = { base?: unknown; timestamp?: unknown; rates?: unknown };
type ProviderOptions = { appId: string; timeoutMs?: number; fetcher?: typeof fetch; now?: () => number };
type CachedPayload = { payload: ProviderPayload; expiresAt: number };

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const latestCacheTtlMs = 60 * 60_000;

export class OpenExchangeRatesProvider implements ExchangeRateProvider {
  readonly id = "open_exchange_rates";
  private readonly appId: string;
  private readonly timeoutMs: number;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private latestCache?: CachedPayload;
  private latestRequest?: Promise<ProviderPayload>;

  constructor(options: ProviderOptions) {
    this.appId = options.appId.trim();
    this.timeoutMs = options.timeoutMs ?? 8_000;
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? Date.now;
    if (!this.appId) throw new ExchangeRateError("Cross-currency transfers are not currently available.", "not_configured");
  }

  async getRate(request: ExchangeRateRequest): Promise<ExchangeRateSnapshot> {
    if (!isSupportedCurrency(request.fromCurrency) || !isSupportedCurrency(request.toCurrency)) {
      throw new ExchangeRateError("That currency pair is not supported.", "unsupported");
    }
    if (request.date && (!datePattern.test(request.date) || Number.isNaN(Date.parse(`${request.date}T00:00:00.000Z`)))) {
      throw new ExchangeRateError("The requested exchange-rate date is invalid.", "unsupported");
    }
    if (request.fromCurrency === request.toCurrency) {
      const now = new Date().toISOString();
      return { ...request, rate: "1", effectiveDate: request.date ?? now.slice(0, 10), publishedAt: now, provider: this.id };
    }

    const payload = request.date ? await this.fetchPayload(request) : await this.getLatestPayload(request);
    return this.snapshotFromPayload(request, payload);
  }

  private async getLatestPayload(request: ExchangeRateRequest): Promise<ProviderPayload> {
    if (this.latestCache && this.latestCache.expiresAt > this.now()) return this.latestCache.payload;
    if (!this.latestRequest) {
      this.latestRequest = this.fetchPayload(request, true).then((payload) => {
        this.assertPayload(payload);
        this.latestCache = { payload, expiresAt: this.now() + latestCacheTtlMs };
        return payload;
      }).finally(() => {
        this.latestRequest = undefined;
      });
    }
    return this.latestRequest;
  }

  private async fetchPayload(request: ExchangeRateRequest, allCurrencies = false): Promise<ProviderPayload> {
    const endpoint = request.date ? `historical/${request.date}.json` : "latest.json";
    const url = new URL(endpoint, "https://openexchangerates.org/api/");
    url.searchParams.set("app_id", this.appId);
    if (!allCurrencies) url.searchParams.set("symbols", [...new Set([request.fromCurrency, request.toCurrency, "USD"])].join(","));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetcher(url, { headers: { accept: "application/json" }, cache: "no-store", signal: controller.signal });
    } catch {
      console.error("[exchange-rate] provider request failed", { provider: this.id, pair: `${request.fromCurrency}/${request.toCurrency}`, requestedDate: request.date ?? "latest" });
      throw new ExchangeRateError("A verified exchange rate is temporarily unavailable. No transfer was made.", "unavailable");
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      console.error("[exchange-rate] provider rejected request", { provider: this.id, status: response.status, pair: `${request.fromCurrency}/${request.toCurrency}`, requestedDate: request.date ?? "latest" });
      throw new ExchangeRateError("A verified exchange rate is temporarily unavailable. No transfer was made.", "unavailable");
    }

    try {
      return await response.json() as ProviderPayload;
    } catch {
      throw new ExchangeRateError("The exchange-rate provider returned an invalid response. No transfer was made.", "invalid_response");
    }
  }

  private snapshotFromPayload(request: ExchangeRateRequest, payload: ProviderPayload): ExchangeRateSnapshot {
    this.assertPayload(payload);
    const rates = payload.rates as Record<string, unknown>;
    const source = request.fromCurrency === "USD" ? 1 : rates[request.fromCurrency];
    const target = request.toCurrency === "USD" ? 1 : rates[request.toCurrency];
    if (typeof source !== "number" || !Number.isFinite(source) || source <= 0 || typeof target !== "number" || !Number.isFinite(target) || target <= 0) {
      throw new ExchangeRateError("A verified rate is unavailable for that currency pair. No transfer was made.", "unsupported");
    }
    const publishedAt = new Date((payload.timestamp as number) * 1_000);
    if (Number.isNaN(publishedAt.getTime())) throw new ExchangeRateError("The exchange-rate provider returned an invalid timestamp. No transfer was made.", "invalid_response");
    const effectiveDate = request.date ?? publishedAt.toISOString().slice(0, 10);
    if (request.date && publishedAt.toISOString().slice(0, 10) !== request.date) {
      throw new ExchangeRateError("A verified rate is unavailable for the requested date. No transfer was made.", "unavailable");
    }
    return { ...request, rate: divideDecimalRates(String(target), String(source)), effectiveDate, publishedAt: publishedAt.toISOString(), provider: this.id };
  }

  private assertPayload(payload: ProviderPayload): void {
    if (payload.base !== "USD" || !Number.isSafeInteger(payload.timestamp) || typeof payload.rates !== "object" || !payload.rates) {
      throw new ExchangeRateError("The exchange-rate provider returned an invalid response. No transfer was made.", "invalid_response");
    }
  }
}
