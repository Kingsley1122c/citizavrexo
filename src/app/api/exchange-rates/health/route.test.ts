import { describe, expect, it, vi } from "vitest";
import { ExchangeRateError } from "@/lib/exchange-rates/types";

const { verifyLiveExchangeRates } = vi.hoisted(() => ({ verifyLiveExchangeRates: vi.fn() }));

vi.mock("@/lib/exchange-rates/live-verification", () => ({ verifyLiveExchangeRates }));

import { GET } from "./route";

describe("exchange-rate health route", () => {
  it("returns only a safe failure category", async () => {
    const credential = "credential-must-not-leak";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    verifyLiveExchangeRates.mockRejectedValueOnce(new ExchangeRateError(`Rejected ${credential}`, "not_configured"));

    const response = await GET();
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toBe('{"status":"unavailable","reason":"not_configured","simulatedOnly":true}');
    expect(body).not.toContain(credential);
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(credential);
    consoleError.mockRestore();
  });
});