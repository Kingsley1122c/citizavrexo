import { NextResponse } from "next/server";
import { verifyLiveExchangeRates } from "@/lib/exchange-rates/live-verification";
import { ExchangeRateError } from "@/lib/exchange-rates/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await verifyLiveExchangeRates();
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const reason = error instanceof ExchangeRateError ? error.code : "verification_failed";
    console.error("[exchange-rate] live verification failed", { reason });
    return NextResponse.json({ status: "unavailable", reason, simulatedOnly: true }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}