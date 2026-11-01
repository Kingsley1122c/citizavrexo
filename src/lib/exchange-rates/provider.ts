import "server-only";

import { OpenExchangeRatesProvider } from "./open-exchange-rates-provider";
import type { ExchangeRateProvider } from "./types";
import { ExchangeRateError } from "./types";

let productionProvider: OpenExchangeRatesProvider | undefined;

export function getExchangeRateProvider(environment: Partial<NodeJS.ProcessEnv> = process.env): ExchangeRateProvider {
  if (environment.EXCHANGE_RATE_PROVIDER !== "open_exchange_rates" || !environment.OPEN_EXCHANGE_RATES_APP_ID) {
    throw new ExchangeRateError("Cross-currency transfers are not currently available.", "not_configured");
  }
  const timeout = Number(environment.EXCHANGE_RATE_TIMEOUT_MS ?? "8000");
  if (!Number.isSafeInteger(timeout) || timeout < 1_000 || timeout > 30_000) {
    throw new ExchangeRateError("Cross-currency transfers are not currently available.", "not_configured");
  }
  if (environment !== process.env) return new OpenExchangeRatesProvider({ appId: environment.OPEN_EXCHANGE_RATES_APP_ID, timeoutMs: timeout });
  productionProvider ??= new OpenExchangeRatesProvider({ appId: environment.OPEN_EXCHANGE_RATES_APP_ID, timeoutMs: timeout });
  return productionProvider;
}
