import { describe, expect, it } from "vitest";
import { usernameCandidates } from "./username-policy";

describe("usernameCandidates", () => {
  it("creates readable, deterministic name-based suggestions", () => {
    expect(usernameCandidates("John Michael", 2026).slice(0, 3)).toEqual(["johnmichael", "john.michael", "johnmichael26"]);
    expect(usernameCandidates("Mary Okafor", 2026).slice(0, 3)).toEqual(["maryokafor", "mary.okafor", "maryokafor26"]);
  });

  it("normalizes accents and keeps every suggestion within the username policy", () => {
    const candidates = usernameCandidates("Élodie D'Angelo", 2026);
    expect(candidates[0]).toBe("elodiedangelo");
    expect(candidates.every((candidate) => candidate.length >= 3 && candidate.length <= 30 && /^[A-Za-z0-9](?:[A-Za-z0-9._]*[A-Za-z0-9])?$/.test(candidate))).toBe(true);
  });
});