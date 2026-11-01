import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consumeAuthRateLimit: vi.fn(() => true),
  isUsernameAvailable: vi.fn(),
  suggestAvailableUsernames: vi.fn(),
}));

vi.mock("@/lib/auth/rate-limit-service", () => ({ consumeAuthRateLimit: mocks.consumeAuthRateLimit }));
vi.mock("@/lib/auth/username-service", () => ({ isUsernameAvailable: mocks.isUsernameAvailable, suggestAvailableUsernames: mocks.suggestAvailableUsernames }));

import { POST } from "./route";

const request = (body: unknown) => new Request("https://citizavrexo.com/api/username", { method: "POST", headers: { "content-type": "application/json", "x-real-ip": "203.0.113.10" }, body: JSON.stringify(body) });

describe("username availability route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns only normalized availability", async () => {
    mocks.isUsernameAvailable.mockReturnValueOnce(false);
    const response = await POST(request({ action: "check", username: "Taken.Name" }));
    expect(await response.json()).toEqual({ valid: true, available: false });
    expect(mocks.isUsernameAvailable).toHaveBeenCalledWith("taken.name");
  });

  it("returns backend-confirmed alternatives without account details", async () => {
    mocks.suggestAvailableUsernames.mockReturnValueOnce(["john.michael", "johnmichael26"]);
    const response = await POST(request({ action: "suggest", name: "John Michael", exclude: ["johnmichael"] }));
    expect(await response.json()).toEqual({ suggestion: "john.michael", alternatives: ["johnmichael26"] });
  });
});