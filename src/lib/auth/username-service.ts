import "server-only";

import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { usernameCandidates, usernameSchema } from "./username-policy";

export function isUsernameAvailable(input: string): boolean {
  const parsed = usernameSchema.safeParse(input);
  if (!parsed.success) return false;
  return !db.select({ id: users.id }).from(users).where(eq(users.username, parsed.data)).limit(1).get();
}

export function suggestAvailableUsernames(name: string, excluded: string[] = [], year?: number): string[] {
  const excludedSet = new Set(excluded.map((value) => value.trim().toLowerCase()));
  const candidates = usernameCandidates(name, year).filter((candidate) => !excludedSet.has(candidate));
  if (!candidates.length) return [];
  const taken = new Set(db.select({ username: users.username }).from(users).where(inArray(users.username, candidates)).all().map((row) => row.username).filter((value): value is string => Boolean(value)));
  return candidates.filter((candidate) => !taken.has(candidate)).slice(0, 3);
}