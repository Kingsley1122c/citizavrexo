import { currencyFractionDigits, type Currency } from "./currency";

export function parseMajorAmountToMinor(value: FormDataEntryValue | null, currency: Currency = "USD"): number | null {
  if (typeof value !== "string") return null;
  const digits = currencyFractionDigits(currency);
  const match = new RegExp(`^(0|[1-9]\\d{0,12})${digits ? `(?:\\.(\\d{1,${digits}}))?` : ""}$`).exec(value.trim());
  if (!match) return null;
  const whole = Number(match[1]);
  const factor = 10 ** digits;
  const fraction = Number((match[2] ?? "").padEnd(digits, "0"));
  const minor = whole * factor + fraction;
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}

export function minorToMajor(amountMinor: number, currency: Currency): number {
  return amountMinor / 10 ** currencyFractionDigits(currency);
}

export function majorToMinor(amount: number, currency: Currency): number | null {
  const value = amount * 10 ** currencyFractionDigits(currency);
  return Number.isSafeInteger(value) ? value : null;
}
