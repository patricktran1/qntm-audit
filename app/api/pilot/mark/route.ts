import { NextResponse } from "next/server";
import { isSessionId } from "@/lib/pilot/attribution";
import { pilotStore } from "@/lib/pilot/store";
import { clientKey, rateLimit } from "@/lib/rate-limit";

/**
 * Marks a lifecycle moment against an existing session without rewriting it.
 * Currently only CTA engagement; lead submission is marked server-side by the
 * lead route, which has stronger evidence that it happened.
 */
export async function POST(request: Request) {
  const limit = rateLimit(`mark:${clientKey(request)}`, 40, 10 * 60 * 1000);
  if (!limit.allowed) return NextResponse.json({ ok: false }, { status: 429 });

  const raw = await request.text();
  if (raw.length > 1024) return NextResponse.json({ ok: false }, { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  if (!isSessionId(b.sessionId) || b.event !== "cta")
    return NextResponse.json({ ok: false }, { status: 400 });

  const result = await pilotStore().markSession(b.sessionId, {
    ctaClickedAt: new Date().toISOString(),
  });
  if (!result.ok) console.warn("[pilot] mark failed", result.error);
  return NextResponse.json({ ok: true });
}
