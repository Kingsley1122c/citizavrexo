export const CUSTOMER_SERVICE_LINE_URL = "https://line.me/ti/p/wfRRjNqPzw";

export function withdrawalSupportMessage(
  template: string,
  details: {
    reference: string;
    amount: string;
    bankName: string;
    accountName: string;
    maskedAccountNumber: string;
  },
): string {
  return Object.entries(details).reduce(
    (message, [key, value]) =>
      message.replaceAll(
        `{${key === "maskedAccountNumber" ? "accountNumber" : key}}`,
        value,
      ),
    template,
  );
}
