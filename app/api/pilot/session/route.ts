import { NextResponse } from "next/server";
import { runAudit } from "@/lib/engine/audit";
import { decodeAnswers } from "@/lib/share";
import { buildSnapshot } from "@/lib/pilot/snapshot";
import { pilotStore } from "@/lib/pilot/store";
import { validateSessionWrite } from "@/lib/pilot/validate";
import type { PilotSession } from "@/lib/pilot/types";
import { clientKey, rateLimit } from "@/lib/rate-limit";

/**
 * Records a completed audit for the pilot.
 *
 * The client sends its session id, attribution, and the encoded answers. It
 * does NOT send the verdict, the score, or any finding — those are recomputed
 * here from the answers, so a crafted request cannot poison the pilot dataset
 * with a result the engine never produced.
 *
 * Failure is never surfaced to the physician: a pilot-storage problem must not
 * make a completed audit look broken.
 */

const LIMIT = 20;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_BODY_BYTES = 8 * 1024;

export async function POST(request: Request) {
  const limit = rateLimit(`pilot:${clientKey(request)}`, LIMIT, WINDOW_MS);
  if (!limit.allowed) return NextResponse.json({ ok: false }, { status: 429 });

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES)
    return NextResponse.json({ ok: false }, { status: 413 });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "malformed" }, { status: 400 });
  }

  const validated = validateSessionWrite(parsed);
  if (!validated.ok)
    return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });

  const input = validated.value;
  const answers = decodeAnswers(input.report);
  if (!answers)
    return NextResponse.json({ ok: false, error: "unreadable report" }, { status: 400 });

  const result = runAudit(answers);

  const session: PilotSession = {
    sessionId: input.sessionId,
    completedAt: new Date().toISOString(),
    firstSeen: input.firstSeen,
    variant: input.variant,
    attribution: input.attribution,
    entryMode: input.entryMode,
    isDemo: input.isDemo,
    durationMs: input.durationMs,
    snapshot: buildSnapshot(result),
    assumptionChanges: input.assumptionChanges,
    leadSubmittedAt: null,
    ctaClickedAt: null,
    report: input.report,
  };

  const store = pilotStore();
  const written = await store.putSession(session);
  if (!written.ok) {
    // Discoverable internally, invisible to the physician.
    console.warn("[pilot] session write failed", written.error);
  }

  return NextResponse.json({ ok: true, stored: written.ok && store.configured });
}
