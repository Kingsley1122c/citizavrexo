import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/authorization", () => ({ requirePermission: vi.fn(async () => ({ id: "admin-user", email: "admin@example.test", adminRole: "administrator" })) }));
vi.mock("@/lib/auth/rate-limit-service", () => ({
  consumeAuthRateLimit: vi.fn(() => true),
}));
vi.mock("@/lib/admin/admin-message-service", () => {
  class AdminMessageError extends Error {}
  return { AdminMessageError, sendAdminMessage: vi.fn(async () => ({ id: "NMSG-test", recipientUserId: "customer-user", recipientName: "Customer User", recipientEmail: "customer@example.test", subject: "Account notice", deliveryStatus: "sent", createdAt: "2026-10-01T12:00:00.000Z", deliveredAt: "2026-10-01T12:00:01.000Z" })) };
});

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/authorization";
import { consumeAuthRateLimit } from "@/lib/auth/rate-limit-service";
import { AdminMessageError, sendAdminMessage } from "@/lib/admin/admin-message-service";
import { sendAdminMessageAction } from "./admin-actions";

const validForm = () => {
  const form = new FormData();
  form.set("recipientUserId", "customer-user");
  form.set("subject", "Account notice");
  form.set("message", "Your account review is complete.");
  form.set("idempotencyKey", "admin-message-action-test");
  return form;
};

describe("admin messaging action", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires messaging permission and sends to the selected user ID", async () => {
    await expect(sendAdminMessageAction({}, validForm())).resolves.toMatchObject({ success: "Message sent successfully.", message: { id: "NMSG-test", recipientUserId: "customer-user", recipientEmail: "customer@example.test", deliveryStatus: "sent" } });
    expect(requirePermission).toHaveBeenCalledWith("notifications.manage");
    expect(sendAdminMessage).toHaveBeenCalledWith({ actorId: "admin-user", actorLabel: "admin@example.test", actorRole: "administrator", recipientUserId: "customer-user", subject: "Account notice", message: "Your account review is complete.", idempotencyKey: "admin-message-action-test" });
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
  });

  it("does not reach the service when authorization is denied", async () => {
    vi.mocked(requirePermission).mockRejectedValueOnce(new Error("Unauthorized"));
    await expect(sendAdminMessageAction({}, validForm())).rejects.toThrow("Unauthorized");
    expect(sendAdminMessage).not.toHaveBeenCalled();
  });

  it("rejects invalid content before delivery", async () => {
    const form = validForm();
    form.set("subject", "");
    await expect(sendAdminMessageAction({}, form)).resolves.toEqual({ error: "Enter a subject and message using the allowed lengths." });
    expect(sendAdminMessage).not.toHaveBeenCalled();
  });

  it("returns the actionable delivery error", async () => {
    vi.mocked(sendAdminMessage).mockRejectedValueOnce(new AdminMessageError("Email delivery failed. Confirm the address and try again shortly."));
    await expect(sendAdminMessageAction({}, validForm())).resolves.toEqual({ error: "Email delivery failed. Confirm the address and try again shortly." });
  });

  it("throttles admin-sensitive actions server-side", async () => {
    vi.mocked(consumeAuthRateLimit).mockReturnValueOnce(false);
    await expect(sendAdminMessageAction({}, validForm())).resolves.toEqual({ error: "Too many attempts. Please try again later." });
    expect(sendAdminMessage).not.toHaveBeenCalled();
  });
});