import type { Currency } from "@/lib/currency";

export type ExchangeRateRequest = {
  fromCurrency: Currency;
  toCurrency: Currency;
  date?: string;
};

export type ExchangeRateSnapshot = {
  fromCurrency: Currency;
  toCurrency: Currency;
  rate: string;
  effectiveDate: string;
  publishedAt: string;
  provider: string;
};

export interface ExchangeRateProvider {
  readonly id: string;
  getRate(request: ExchangeRateRequest): Promise<ExchangeRateSnapshot>;
}

export class ExchangeRateError extends Error {
  constructor(message: string, readonly code: "not_configured" | "unavailable" | "unsupported" | "invalid_response") {
    super(message);
    this.name = "ExchangeRateError";
  }
}