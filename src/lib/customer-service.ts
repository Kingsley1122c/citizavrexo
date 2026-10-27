import "server-only";

import { CUSTOMER_SERVICE_LINE_URL } from "@/lib/customer-service-config";

export type CustomerServiceContact = { lineUrl: string; email?: string };

export function getCustomerServiceContact(): CustomerServiceContact {
  const email = process.env.CUSTOMER_SERVICE_EMAIL?.trim();
  return {
    lineUrl: CUSTOMER_SERVICE_LINE_URL,
    email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined,
  };
}