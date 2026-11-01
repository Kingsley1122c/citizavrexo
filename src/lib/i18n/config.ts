export const SUPPORTED_LOCALES = ["en", "fr", "es", "pt", "ja", "ko", "zh-CN", "zh-TW", "th", "vi", "id", "ms", "hi", "bn"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const localeNames: Record<Locale, string> = {
  en: "English", fr: "Français", es: "Español", pt: "Português",
  ja: "日本語", ko: "한국어", "zh-CN": "简体中文", "zh-TW": "繁體中文（台灣）",
  th: "ไทย", vi: "Tiếng Việt", id: "Bahasa Indonesia", ms: "Bahasa Melayu",
  hi: "हिन्दी", bn: "বাংলা",
};

export function resolveSupportedLocale(value?: string | null): Locale {
  if (!value) return "en";
  const normalized = value.replace("_", "-");
  const exact = SUPPORTED_LOCALES.find((locale) => locale.toLowerCase() === normalized.toLowerCase());
  if (exact) return exact;
  const language = normalized.split("-")[0].toLowerCase();
  return SUPPORTED_LOCALES.find((locale) => locale.toLowerCase() === language) ?? "en";
}

export const REGISTRATION_LOCALES = SUPPORTED_LOCALES;