"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/authorization";
import { clearAuthRateLimit, consumeAuthRateLimit } from "@/lib/auth/rate-limit-service";
import { AdministratorTransferDeliveryUnavailableError, completeAdministratorTransfer, initiateAdministratorTransfer } from "@/lib/auth/administrator-transfer-service";
import { deliverAdministratorTransferVerification } from "@/lib/notifications/administrator-transfer-delivery";

export type AdministratorTransferState = { error?: string; success?: string };
const email = z.string().trim().email().max(254);
const password = z.string().min(12).max(128);

export async function initiateAdministratorTransferAction(_: AdministratorTransferState, formData: FormData): Promise<AdministratorTransferState> {
  const identity = await requirePermission("admin.ownership.transfer");
  const parsed = z.object({ newEmail: email, currentPassword: password }).safeParse({ newEmail: formData.get("newEmail"), currentPassword: formData.get("currentPassword") });
  if (!parsed.success) return { error: "Enter a valid email address and your current password." };
  if (!consumeAuthRateLimit("admin_transfer", identity.id)) return { error: "Too many attempts. Please try again later." };

  try {
    await initiateAdministratorTransfer({ actorId: identity.id, ...parsed.data, deliver: deliverAdministratorTransferVerification });
    await clearAuthRateLimit("admin_transfer", identity.id);
    return { success: "A secure verification link has been sent to the new administrator." };
  } catch (error) {
    if (error instanceof AdministratorTransferDeliveryUnavailableError) return { error: "Verification email delivery must be configured before ownership can be transferred." };
    return { error: "Unable to start the transfer. Check your details and try again." };
  }
}

export async function completeAdministratorTransferAction(_: AdministratorTransferState, formData: FormData): Promise<AdministratorTransferState> {
  const parsed = z.object({ verificationToken: z.string().min(32).max(128), newAdministratorName: z.string().trim().min(2).max(100).regex(/^[^\p{Cc}\p{Cf}]+$/u), newPassword: password }).safeParse({ verificationToken: formData.get("verificationToken"), newAdministratorName: formData.get("newAdministratorName"), newPassword: formData.get("newPassword") });
  if (!parsed.success) return { error: "This verification link is invalid or the submitted details are incomplete." };
  if (!consumeAuthRateLimit("admin_transfer_verify", parsed.data.verificationToken)) return { error: "This verification link is invalid or expired." };

  try {
    await completeAdministratorTransfer(parsed.data);
    await clearAuthRateLimit("admin_transfer_verify", parsed.data.verificationToken);
  } catch {
    return { error: "This verification link is invalid or expired." };
  }
  redirect("/login?handover=complete");
}