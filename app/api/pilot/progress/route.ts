import { NextResponse } from "next/server";
import { pilotStore } from "@/lib/pilot/store";
import { validateProgressWrite } from "@/lib/pilot/validate";
import type { AuditProgress } from "@/lib/pilot/types";
import { clientKey, rateLimit } from "@/lib/rate-limit";

/**
 * Records how far a visitor got through the questionnaire.
 *
 * This is the only endpoint that hears from someone who does not finish, and
 * it is the whole point of it: the pilot has a stop condition named
 * "questionnaire failure", and until now it could only see the people the
 * questionnaire did not fail.
 *
 * What crosses the boundary is deliberately thin — a step index and a list of
 * question KEYS. No answer value is sent, so a visitor who abandons at
 * "Annual collections" leaves behind the fact that they got there and stopped,
 * and nothing about their practice. See PRIVACY.md.
 *
 * Failure is invisible to the visitor. Nothing here may slow down or interrupt
 * an audit in progress.
 */

/**
 * One audit costs about ten of these (a write per step advance, one on page
 * hide, one to latch completion), and the limiter keys on IP.
 *
 * A clinic behind one NAT, a conference booth on venue wifi, or a physician
 * who restarts a couple of times all share a key — and a dropped progress
 * write does not just lose a row, it UNDERCOUNTS STARTS, which is the one
 * number this endpoint exists to make trustworthy. So the ceiling is set for
 * roughly twenty audits per address per window rather than four. The payload
 * is a few hundred bytes and bounded below, so this is not an abuse surface.
 */
const LIMIT = 200;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_BODY_BYTES = 4 * 1024;

export async function POST(request: Request) {
  const limit = rateLimit(`progress:${clientKey(request)}`, LIMIT, WINDOW_MS);
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

  const validated = validateProgressWrite(parsed);
  if (!validated.ok)
    return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });

  const now = new Date().toISOString();
  const progress: AuditProgress = {
    ...validated.value,
    // Timestamps are server-side. The store's merge keeps the earliest
    // startedAt, so a later write cannot make an audit look newer than it is.
    startedAt: now,
    lastSeenAt: now,
  };

  const written = await pilotStore().putProgress(progress);
  if (!written.ok) console.warn("[pilot] progress write failed", written.error);

  return NextResponse.json({ ok: true });
}
