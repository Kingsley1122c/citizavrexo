import { NextResponse } from "next/server";
import { z } from "zod";
import { consumeAuthRateLimit } from "@/lib/auth/rate-limit-service";
import { isUsernameAvailable, suggestAvailableUsernames } from "@/lib/auth/username-service";
import { usernameSchema } from "@/lib/auth/username-policy";

export const dynamic = "force-dynamic";

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("check"), username: z.string().trim().min(1).max(30) }),
  z.object({ action: z.literal("suggest"), name: z.string().trim().min(2).max(100), exclude: z.array(z.string().max(30)).max(10).default([]) }),
]);

const responseHeaders = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const address = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  if (!consumeAuthRateLimit("username_availability", address)) {
    return NextResponse.json({ error: "Too many checks. Please wait and try again." }, { status: 429, headers: responseHeaders });
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid username request." }, { status: 400, headers: responseHeaders });
  if (parsed.data.action === "check") {
    const normalized = usernameSchema.safeParse(parsed.data.username);
    return NextResponse.json({ valid: normalized.success, available: normalized.success && isUsernameAvailable(normalized.data) }, { headers: responseHeaders });
  }
  const suggestions = suggestAvailableUsernames(parsed.data.name, parsed.data.exclude);
  return NextResponse.json({ suggestion: suggestions[0] ?? null, alternatives: suggestions.slice(1) }, { headers: responseHeaders });
}