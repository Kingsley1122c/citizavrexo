"use client";

import { Globe2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { localeNames, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/config";

export function PublicLanguageSelect() {
  const router = useRouter();
  const chooseLocale = (locale: Locale) => {
    localStorage.setItem("Citizavrexo-locale", locale);
    router.push("/login");
  };

  return <label className="landing-language"><Globe2 size={15}/><span className="sr-only">Language</span><select aria-label="Language" defaultValue="en" onChange={(event) => chooseLocale(event.target.value as Locale)}>{SUPPORTED_LOCALES.map((locale) => <option value={locale} key={locale}>{localeNames[locale]}</option>)}</select></label>;
}

