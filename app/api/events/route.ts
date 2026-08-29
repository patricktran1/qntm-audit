import { NextResponse } from "next/server";
import { clientKey, rateLimit } from "@/lib/rate-limit";

/**
 * Analytics sink. Validates the shape and drops the event unless a destination
 * is configured. The client only ever emits the banded vocabulary in
 * lib/analytics.ts — no raw financials, no contact details, no free text.
 */

const LIMIT = 240;
const WINDOW_MS = 60 * 1000;
const MAX_BODY_BYTES = 8 * 1024;

export async function POST(request: Request) {
  const limit = rateLimit(`events:${clientKey(request)}`, LIMIT, WINDOW_MS);
  if (!limit.allowed)
    return NextResponse.json({ ok: false }, { status: 429 });

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES)
    return NextResponse.json({ ok: false }, { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("event" in body) ||
    typeof (body as { event: unknown }).event !== "object" ||
    (body as { event: { name?: unknown } }).event === null ||
    typeof (body as { event: { name?: unknown } }).event.name !== "string"
  ) {
    return NextResponse.json({ ok: false, error: "invalid event" }, { status: 400 });
  }

  if (process.env.ANALYTICS_WEBHOOK_URL) {
    try {
      await fetch(process.env.ANALYTICS_WEBHOOK_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // Never fail the caller because a downstream sink is unavailable.
    }
  }

  return NextResponse.json({ ok: true });
}
