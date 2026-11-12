import { NextResponse } from "next/server";

// Rendered per request so the call always reaches the Next.js server
// function — that's the point: netlify/functions/keep-warm.mts hits this
// every few minutes so the function stays loaded, instead of the first
// login or tap after a quiet spell paying a 5-13s cold start. No database
// or auth work, so it costs next to nothing.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
