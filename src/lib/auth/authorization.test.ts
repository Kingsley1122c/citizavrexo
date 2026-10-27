import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getAuthenticatedUser: vi.fn(), appendAuditEvent: vi.fn(), redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`); }) }));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("./session-service", () => ({ getAuthenticatedUser: mocks.getAuthenticatedUser }));
vi.mock("@/lib/audit/audit-service", () => ({ appendAuditEvent: mocks.appendAuditEvent }));

describe("admin authorization boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirects a normal active customer and audits the denied permission", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue({ id: "customer", name: "Customer", email: "customer@example.test", status: "active", adminRole: null, sessionId: "session" });
    const { requirePermission } = await import("./authorization");
    await expect(requirePermission("admin.dashboard.read")).rejects.toThrow("REDIRECT:/");
    expect(mocks.appendAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ actorId: "customer", action: "authorization.denied", target: "admin.dashboard.read", result: "denied" }));
  });

  it("returns an administrator that owns the requested permission", async () => {
    const administrator = { id: "administrator", name: "Administrator", email: "admin@example.test", status: "active", adminRole: "administrator", sessionId: "session" };
    mocks.getAuthenticatedUser.mockResolvedValue(administrator);
    const { requirePermission } = await import("./authorization");
    await expect(requirePermission("accounts.credit")).resolves.toBe(administrator);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
