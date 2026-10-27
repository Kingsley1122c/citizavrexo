import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { deploymentId: process.env.RENDER_GIT_COMMIT ?? "development" },
    { headers: { "Cache-Control": "no-store" } },
  );
}