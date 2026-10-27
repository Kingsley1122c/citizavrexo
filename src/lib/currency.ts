export const SUPPORTED_CURRENCIES = [
  "AED", "AFN", "ALL", "AMD", "ANG", "AOA", "ARS", "AUD", "AWG", "AZN",
  "BAM", "BBD", "BDT", "BGN", "BHD", "BMD", "BND", "BOB", "BRL", "BSD", "BTN", "BYN", "BZD",
  "CAD", "CHF", "CLP", "CNY", "COP", "CRC", "CUP", "CZK",
  "DKK", "DOP", "EUR", "FJD", "FKP", "GBP", "GEL", "GTQ", "GYD",
  "HKD", "HNL", "HTG", "HUF", "IDR", "ILS", "INR", "IQD", "IRR", "ISK",
  "JMD", "JOD", "JPY", "KGS", "KHR", "KPW", "KRW", "KWD", "KYD", "KZT",
  "LAK", "LBP", "LKR", "MDL", "MKD", "MMK", "MNT", "MOP", "MVR", "MXN", "MYR",
  "NIO", "NOK", "NPR", "NZD", "OMR", "PAB", "PEN", "PHP", "PKR", "PLN", "PYG",
  "QAR", "RON", "RSD", "RUB", "SAR", "SEK", "SGD", "SRD", "SYP",
  "THB", "TJS", "TMT", "TRY", "TTD", "TWD", "UAH", "USD", "UYU", "UZS",
  "VES", "VND", "XCD", "YER",
] as const;

export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

const ZERO_FRACTION_CURRENCIES = new Set<Currency>(["CLP", "ISK", "JPY", "KRW", "PYG", "VND"]);
const THREE_FRACTION_CURRENCIES = new Set<Currency>(["BHD", "IQD", "JOD", "KWD", "OMR"]);

export function currencyFractionDigits(currency: Currency): number {
  if (ZERO_FRACTION_CURRENCIES.has(currency)) return 0;
  if (THREE_FRACTION_CURRENCIES.has(currency)) return 3;
  return 2;
}

export function currencyInputStep(currency: Currency): string {
  const fractionDigits = currencyFractionDigits(currency);
  return fractionDigits === 0 ? "1" : `0.${"0".repeat(fractionDigits - 1)}1`;
}

const currencyNames = new Intl.DisplayNames(["en"], { type: "currency" });

export const currencyConfig = Object.fromEntries(SUPPORTED_CURRENCIES.map((code) => [code, {
  name: currencyNames.of(code) ?? code,
  fractionDigits: currencyFractionDigits(code),
}])) as Record<Currency, { name: string; fractionDigits: number }>;

export function isSupportedCurrency(value: string): value is Currency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

export function currencyName(currency: Currency, locale = "en"): string {
  return new Intl.DisplayNames([locale], { type: "currency" }).of(currency) ?? currencyConfig[currency].name;
}

const currencyRegions: Partial<Record<Currency, string>> = {
  AED: "AE", ARS: "AR", AUD: "AU", BDT: "BD", BGN: "BG", BHD: "BH", BRL: "BR", CAD: "CA", CHF: "CH", CLP: "CL", CNY: "CN", COP: "CO", CZK: "CZ", DKK: "DK", EUR: "EU", GBP: "GB", HKD: "HK", HUF: "HU", IDR: "ID", ILS: "IL", INR: "IN", IQD: "IQ", ISK: "IS", JOD: "JO", JPY: "JP", KRW: "KR", KWD: "KW", MXN: "MX", MYR: "MY", NOK: "NO", NZD: "NZ", OMR: "OM", PHP: "PH", PKR: "PK", PLN: "PL", QAR: "QA", RON: "RO", RUB: "RU", SAR: "SA", SEK: "SE", SGD: "SG", THB: "TH", TRY: "TR", TWD: "TW", UAH: "UA", USD: "US", VND: "VN",
};

export function currencySymbol(currency: Currency, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay: "narrowSymbol", minimumFractionDigits: 0, maximumFractionDigits: 0 }).formatToParts(0).find((part) => part.type === "currency")?.value ?? currency;
}

export function currencyFlag(currency: Currency): string | undefined {
  const region = currencyRegions[currency];
  return region ? String.fromCodePoint(...[...region].map((character) => 127397 + character.charCodeAt(0))) : undefined;
}

export function formatCurrencyAmount(amount: number, currency: string, locale = "en-US"): string {
  const fractionDigits = isSupportedCurrency(currency) ? currencyFractionDigits(currency) : 2;
  return new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay: "narrowSymbol", minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }).format(amount);
}

export function formatCurrency(amount: number, currency: Currency = "USD", locale = "en-US"): string {
  return `${formatCurrencyAmount(amount, currency, locale)} ${currency}`;
}