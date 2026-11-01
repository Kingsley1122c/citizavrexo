import "server-only";

import {
  CUSTOMER_SERVICE_LINE_URL,
  CUSTOMER_SERVICE_WHATSAPP_NUMBER,
  CUSTOMER_SERVICE_WHATSAPP_URL,
} from "@/lib/customer-service-config";

export type CustomerServiceContact = {
  whatsappNumber: string;
  whatsappUrl: string;
  lineUrl: string;
  email?: string;
};

function configuredUrl(value: string | undefined, fallback: string, origin: string): string {
  try {
    const url = new URL(value?.trim() || fallback);
    return url.protocol === "https:" && url.origin === origin ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

export function getCustomerServiceContact(): CustomerServiceContact {
  const email = process.env.CUSTOMER_SERVICE_EMAIL?.trim();
  return {
    whatsappNumber: CUSTOMER_SERVICE_WHATSAPP_NUMBER,
    whatsappUrl: configuredUrl(process.env.CUSTOMER_SERVICE_WHATSAPP_URL, CUSTOMER_SERVICE_WHATSAPP_URL, "https://wa.me"),
    lineUrl: configuredUrl(process.env.CUSTOMER_SERVICE_LINE_URL, CUSTOMER_SERVICE_LINE_URL, "https://line.me"),
    email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined,
  };
}