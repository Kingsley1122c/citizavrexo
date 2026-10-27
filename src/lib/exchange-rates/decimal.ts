import { currencyFractionDigits, type Currency } from "@/lib/currency";
import { ExchangeRateError } from "./types";

type Ratio = { numerator: bigint; denominator: bigint };

function powerOfTen(exponent: number): bigint {
  return BigInt(10) ** BigInt(exponent);
}

export function decimalToRatio(value: string): Ratio {
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(value.trim());
  if (!match) throw new ExchangeRateError("The exchange-rate provider returned an invalid rate.", "invalid_response");
  const fraction = match[2] ?? "";
  const exponent = Number(match[3] ?? "0") - fraction.length;
  if (!Number.isSafeInteger(exponent)) throw new ExchangeRateError("The exchange-rate provider returned an invalid rate.", "invalid_response");
  const coefficient = BigInt(`${match[1]}${fraction}`);
  if (coefficient <= BigInt(0)) throw new ExchangeRateError("The exchange-rate provider returned an invalid rate.", "invalid_response");
  return exponent >= 0
    ? { numerator: coefficient * powerOfTen(exponent), denominator: BigInt(1) }
    : { numerator: coefficient, denominator: powerOfTen(-exponent) };
}

export function divideDecimalRates(targetRate: string, sourceRate: string, precision = 18): string {
  const target = decimalToRatio(targetRate);
  const source = decimalToRatio(sourceRate);
  const numerator = target.numerator * source.denominator;
  const denominator = target.denominator * source.numerator;
  const scale = powerOfTen(precision);
  const scaled = (numerator * scale + denominator / BigInt(2)) / denominator;
  const digits = scaled.toString().padStart(precision + 1, "0");
  const whole = digits.slice(0, -precision);
  const fraction = digits.slice(-precision).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

export function convertMinorAmount(amountMinor: number, fromCurrency: Currency, toCurrency: Currency, rate: string): number {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new ExchangeRateError("Enter a valid amount greater than zero.", "invalid_response");
  const ratio = decimalToRatio(rate);
  const sourceFactor = powerOfTen(currencyFractionDigits(fromCurrency));
  const targetFactor = powerOfTen(currencyFractionDigits(toCurrency));
  const numerator = BigInt(amountMinor) * ratio.numerator * targetFactor;
  const denominator = ratio.denominator * sourceFactor;
  const converted = (numerator + denominator / BigInt(2)) / denominator;
  if (converted <= BigInt(0) || converted > BigInt(Number.MAX_SAFE_INTEGER)) throw new ExchangeRateError("The converted amount is outside the supported range.", "invalid_response");
  return Number(converted);
}