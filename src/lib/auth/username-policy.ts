import { z } from "zod";

export const USERNAME_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._]*[A-Za-z0-9])?$/;

export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(30)
  .regex(USERNAME_PATTERN)
  .transform((username) => username.toLowerCase());

export function usernameCandidates(name: string, year = new Date().getUTCFullYear()): string[] {
  const words = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .match(/[a-z0-9]+/g) ?? [];
  const usable = words.filter(Boolean);
  if (!usable.length) return [];
  const first = usable[0];
  const last = usable.at(-1) ?? first;
  const joined = usable.join("").slice(0, 24);
  const dotted = usable.join(".").slice(0, 30).replace(/[.]$/, "");
  const shortYear = String(year).slice(-2);
  const candidates = [joined, dotted, `${joined}${shortYear}`, `${first[0]}${last}`, `${first}.${last}`];
  for (let suffix = 2; suffix <= 20; suffix += 1) candidates.push(`${joined.slice(0, 27)}${suffix}`);
  return [...new Set(candidates.filter((candidate) => candidate.length >= 3 && candidate.length <= 30 && USERNAME_PATTERN.test(candidate)))];
}