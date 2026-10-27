import type { Locale } from "@/lib/i18n/config";
import { bn } from "./bn";
import { en } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { hi } from "./hi";
import { id } from "./id";
import { ja } from "./ja";
import { ko } from "./ko";
import { ms } from "./ms";
import { pt } from "./pt";
import { th } from "./th";
import { vi } from "./vi";
import { zhCN } from "./zh-CN";
import { zhTW } from "./zh-TW";
import type { UserUiCatalogByLocale } from "./schema";

export const userUiCatalogs: UserUiCatalogByLocale = {
  en,
  fr,
  es,
  pt,
  ja,
  ko,
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  th,
  vi,
  id,
  ms,
  hi,
  bn,
};

export function getUserUiCatalog(locale: Locale) {
  return userUiCatalogs[locale];
}
