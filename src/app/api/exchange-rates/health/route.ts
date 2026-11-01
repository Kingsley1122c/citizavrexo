import { NextResponse } from "next/server";
import { verifyLiveExchangeRates } from "@/lib/exchange-rates/live-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await verifyLiveExchangeRates();
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "unavailable", simulatedOnly: true }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}