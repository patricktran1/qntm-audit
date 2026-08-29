import { NextResponse } from "next/server";

/**
 * Analytics sink. Deliberately a stub: it validates the shape and drops the
 * event unless a destination is configured. Swapping in a real destination is
 * one function call, and nothing else in the product needs to change.
 *
 * No practice identifiers, names, or contact details are ever sent here — the
 * client only emits the event vocabulary in lib/analytics.ts.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("event" in body) ||
    typeof (body as { event: unknown }).event !== "object"
  ) {
    return NextResponse.json({ ok: false, error: "invalid event" }, { status: 400 });
  }

  // Wire a destination here (PostHog, Plausible, a warehouse). Until one
  // exists, accepting and dropping is the honest behaviour.
  if (process.env.ANALYTICS_WEBHOOK_URL) {
    try {
      await fetch(process.env.ANALYTICS_WEBHOOK_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      // Never fail the caller because a downstream sink is unavailable.
    }
  }

  return NextResponse.json({ ok: true });
}
