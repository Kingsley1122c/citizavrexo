export const CUSTOMER_SERVICE_WHATSAPP_NUMBER = "+44 7392 968025";
export const CUSTOMER_SERVICE_WHATSAPP_URL = "https://wa.me/447392968025";
export const CUSTOMER_SERVICE_LINE_URL = "https://line.me/ti/p/RDf5RXaT2G";

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
