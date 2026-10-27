import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "@/lib/i18n/config";
import { userUiCatalogs } from "@/lib/i18n/locales/user-ui";
import { localizeAccountName, localizeTransactionDescription, localizeTransactionType, localizeUserActionMessage } from "@/lib/i18n/user-ui";

function collectLeafPaths(value: unknown, path = ""): string[] {
  if (typeof value === "string") return [path];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) =>
    collectLeafPaths(nested, path ? `${path}.${key}` : key),
  );
}

function collectLeaves(value: unknown, path = ""): Record<string, string> {
  if (typeof value === "string") return { [path]: value };
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) =>
    Object.entries(collectLeaves(nested, path ? `${path}.${key}` : key)),
  ));
}

const brandPaths = ["email.subjectPrefix", "email.brand"];
const allowedEnglishMatches: Partial<Record<(typeof SUPPORTED_LOCALES)[number], string[]>> = {
  fr: [...brandPaths, "app.nav.transactions", "app.nav.notifications", "app.menu", "app.important", "app.destination", "app.transactionsView.title", "app.transactionsView.tableTransaction", "app.transactionsView.tableDate", "app.transactionsView.type", "app.securityView.overline", "app.settingsView.communication", "receipt.date"],
  es: brandPaths,
  pt: [...brandPaths, "app.menu"],
  ja: brandPaths,
  ko: brandPaths,
  "zh-CN": brandPaths,
  "zh-TW": brandPaths,
  th: brandPaths,
  vi: [...brandPaths, "app.menu"],
  id: [...brandPaths, "app.menu", "app.accountsView.status", "app.transactionsView.tableStatus", "destination.label", "app.transactionDescriptions.transfer"],
  ms: [...brandPaths, "app.menu", "app.accountsView.status", "app.transactionsView.tableStatus", "destination.label"],
  hi: brandPaths,
  bn: brandPaths,
};

describe("user-ui catalogs", () => {
  it("has a complete typed catalog for every supported locale", () => {
    const enPaths = collectLeafPaths(userUiCatalogs.en).sort();
    for (const locale of SUPPORTED_LOCALES) {
      expect(userUiCatalogs[locale]).toBeDefined();
      expect(userUiCatalogs[locale].app.nav.home.length).toBeGreaterThan(0);
      expect(userUiCatalogs[locale].auth.loginTitle.length).toBeGreaterThan(0);
      expect(userUiCatalogs[locale].money.send.length).toBeGreaterThan(0);
      expect(userUiCatalogs[locale].receipt.amountTransferred.length).toBeGreaterThan(0);
      expect(userUiCatalogs[locale].email.subjects.welcome.length).toBeGreaterThan(0);
      expect(collectLeafPaths(userUiCatalogs[locale]).sort()).toEqual(enPaths);
      if (locale !== "en") expect(userUiCatalogs[locale]).not.toBe(userUiCatalogs.en);
    }
  });

  it("does not reuse English CJK workflow and receipt strings", () => {
    const en = userUiCatalogs.en;
    expect(userUiCatalogs.ja.money.sendTitle).not.toBe(en.money.sendTitle);
    expect(userUiCatalogs.ko.money.sendTitle).not.toBe(en.money.sendTitle);
    expect(userUiCatalogs["zh-CN"].money.sendTitle).not.toBe(en.money.sendTitle);
    expect(userUiCatalogs["zh-TW"].money.sendTitle).not.toBe(en.money.sendTitle);

    expect(userUiCatalogs.ja.receipt.amountTransferred).not.toBe(en.receipt.amountTransferred);
    expect(userUiCatalogs.ko.receipt.amountTransferred).not.toBe(en.receipt.amountTransferred);
    expect(userUiCatalogs["zh-CN"].receipt.amountTransferred).not.toBe(en.receipt.amountTransferred);
    expect(userUiCatalogs["zh-TW"].receipt.amountTransferred).not.toBe(en.receipt.amountTransferred);
  });

  it("localizes auth titles in non-English locales", () => {
    const en = userUiCatalogs.en;
    expect(userUiCatalogs.fr.auth.loginTitle).not.toBe(en.auth.loginTitle);
    expect(userUiCatalogs.es.auth.loginTitle).not.toBe(en.auth.loginTitle);
    expect(userUiCatalogs.pt.auth.loginTitle).not.toBe(en.auth.loginTitle);
  });

  it("localizes CJK auth, profile, and card workflow strings", () => {
    const en = userUiCatalogs.en;
    for (const locale of ["ja", "ko", "zh-CN", "zh-TW"] as const) {
      expect(userUiCatalogs[locale].auth.marketingEyebrow).not.toBe(en.auth.marketingEyebrow);
      expect(userUiCatalogs[locale].profileCompletion.title).not.toBe(en.profileCompletion.title);
      expect(userUiCatalogs[locale].cardRequest.title).not.toBe(en.cardRequest.title);
      expect(userUiCatalogs[locale].receipt.amountTransferred).not.toBe(en.receipt.amountTransferred);
      expect(userUiCatalogs[locale].money.sendTitle).not.toBe(en.money.sendTitle);
    }
  });

  it("does not silently reuse English outside audited language invariants", () => {
    const english = collectLeaves(userUiCatalogs.en);
    for (const locale of SUPPORTED_LOCALES.filter((value) => value !== "en")) {
      const translated = collectLeaves(userUiCatalogs[locale]);
      const matches = Object.keys(english).filter((path) => translated[path] === english[path]).sort();
      expect(matches).toEqual([...(allowedEnglishMatches[locale] ?? [])].sort());
    }
  });

  it("preserves every interpolation placeholder in every locale", () => {
    const english = collectLeaves(userUiCatalogs.en);
    const placeholders = (value: string) => [...value.matchAll(/\{[^}]+\}/g)].map(([token]) => token).sort();
    for (const locale of SUPPORTED_LOCALES) {
      const translated = collectLeaves(userUiCatalogs[locale]);
      for (const path of Object.keys(english)) expect(placeholders(translated[path])).toEqual(placeholders(english[path]));
    }
  });

  it("localizes canonical account names for Japanese users", () => {
    expect(localizeAccountName("ja", "Personal Account")).toBe(userUiCatalogs.ja.app.accountTypes.personal);
    expect(localizeAccountName("ja", "Dollar Account")).toBe(userUiCatalogs.ja.app.accountTypes.personal);
    expect(localizeAccountName("ja", "Savings Account")).toBe(userUiCatalogs.ja.app.accountTypes.savings);
    expect(localizeAccountName("ja", "Business Account")).toBe(userUiCatalogs.ja.app.accountTypes.business);
  });

  it("localizes canonical transaction descriptions and types for Japanese users", () => {
    expect(localizeTransactionDescription("ja", "Salary Credit")).toBe(userUiCatalogs.ja.app.transactionDescriptions.salaryCredit);
    expect(localizeTransactionDescription("ja", "Investment Return")).toBe(userUiCatalogs.ja.app.transactionDescriptions.investmentReturn);
    expect(localizeTransactionDescription("ja", "Card Payment")).toBe(userUiCatalogs.ja.app.transactionDescriptions.cardPayment);
    expect(localizeTransactionDescription("ja", "Administrative account credit")).toBe(userUiCatalogs.ja.app.transactionDescriptions.administrativeAccountCredit);
    expect(localizeTransactionType("ja", "credit")).toBe(userUiCatalogs.ja.notifications.titleAccountCredited);
    expect(localizeTransactionType("ja", "debit")).toBe(userUiCatalogs.ja.notifications.titleAccountDebited);
    expect(localizeTransactionType("ja", "transfer")).toBe(userUiCatalogs.ja.app.transactionDescriptions.transfer);
    expect(localizeTransactionType("ja", "card")).toBe(userUiCatalogs.ja.app.nav.cards);
    for (const locale of SUPPORTED_LOCALES) expect(localizeTransactionType(locale, "credit")).not.toBe("credit");
  });

  it("preserves the counterparty name in dynamic transfer descriptions", () => {
    expect(localizeTransactionDescription("ja", "Transfer to Hana Sato")).toBe(userUiCatalogs.ja.app.transactionDescriptions.transferTo.replace("{name}", "Hana Sato"));
    expect(localizeTransactionDescription("ja", "Transfer from Hana Sato")).toContain("Hana Sato");
    expect(localizeTransactionDescription("fr", "Transfer to Jean Dupont")).toContain("Jean Dupont");
    expect(localizeTransactionDescription("fr", "Transfer from Jean Dupont")).toContain("Jean Dupont");
  });

  it("passes through arbitrary user-entered account names and descriptions unchanged", () => {
    expect(localizeAccountName("ja", "Jane's Rent Fund")).toBe("Jane's Rent Fund");
    expect(localizeAccountName("fr", "First National Reserve")).toBe("First National Reserve");
    expect(localizeTransactionDescription("ja", "Coffee with Alex")).toBe("Coffee with Alex");
    expect(localizeTransactionDescription("fr", "Rent - September")).toBe("Rent - September");
  });

  it("does not hide safe profile and withdrawal domain errors behind the generic fallback", () => {
    expect(localizeUserActionMessage("en", "Complete every required profile field with valid information.")).toBe("Complete every required profile field with valid information.");
    expect(localizeUserActionMessage("en", "A withdrawal request is already pending for this account.")).toBe("A withdrawal request is already pending for this account.");
    expect(localizeUserActionMessage("en", "Sensitive internal failure details")).toBe(userUiCatalogs.en.messages.genericActionError);
  });
});
