import "server-only";

import { createHash } from "node:crypto";
import { AdministratorTransferDeliveryUnavailableError, type AdministratorTransferDelivery } from "@/lib/auth/administrator-transfer-service";
import { getApplicationUrl, resendEmailTransport } from "./resend-transport";

export const deliverAdministratorTransferVerification: AdministratorTransferDelivery = async ({ recipient, verificationToken, expiresAt }) => {
  try {
    const url = `${getApplicationUrl()}/admin-transfer?token=${encodeURIComponent(verificationToken)}`;
    await resendEmailTransport.send({
      to: recipient,
      subject: "Nivora Core · Administrator ownership transfer",
      text: `A Nivora Core super administrator invited you to accept administrator ownership.\n\nContinue securely: ${url}\n\nThis single-use link expires at ${expiresAt}. If you did not expect this invitation, ignore this email.`,
      idempotencyKey: `admin-transfer/${createHash("sha256").update(verificationToken).digest("hex")}`,
    });
  } catch {
    throw new AdministratorTransferDeliveryUnavailableError();
  }
};