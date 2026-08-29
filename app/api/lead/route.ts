import { NextResponse } from "next/server";
import { deliverLead } from "@/lib/leads/deliver";
import { validateLead } from "@/lib/leads/validate";
import type { LeadRecord } from "@/lib/leads/types";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { runAudit } from "@/lib/engine/audit";
import { MODEL_VERSION } from "@/lib/engine/version";
import { decodeAnswers } from "@/lib/share";
import { pilotStore } from "@/lib/pilot/store";

/** Five submissions per address per ten minutes. Generous for a human. */
const LIMIT = 5;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_BODY_BYTES = 16 * 1024;

export async function POST(request: Request) {
  const limit = rateLimit(`lead:${clientKey(request)}`, LIMIT, WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES)
    return NextResponse.json({ ok: false, error: "Request too large." }, { status: 413 });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed request." }, { status: 400 });
  }

  const validated = validateLead(parsed);
  if (!validated.ok)
    return NextResponse.json(
      { ok: false, error: validated.error, field: validated.field },
      { status: 400 },
    );

  const input = validated.value;

  // Derive practice context server-side from the encoded answers rather than
  // trusting anything the client claims about the audit.
  const answers = input.report ? decodeAnswers(input.report) : null;
  const result = answers ? runAudit(answers) : null;

  const record: LeadRecord = {
    ...input,
    receivedAt: new Date().toISOString(),
    context: {
      verdict: result?.verdict.level ?? "insufficient_data",
      posture: result?.offer.posture ?? "soft",
      score: result?.score.overall ?? null,
      topFinding: result?.topOpportunities[0]?.title ?? null,
      topCategory: result?.topOpportunities[0]?.category ?? null,
      physicians: answers?.physicians ?? null,
      opportunityLow: result?.opportunityLow ?? 0,
      opportunityHigh: result?.opportunityHigh ?? 0,
      completeness: result?.completeness ?? 0,
      coverage: result?.score.coverage ?? 0,
      // One line, so a notification carries evidence rather than a headline.
      strongestEvidence: (() => {
        const top = result?.topOpportunities[0];
        const line = top?.evidence.find((e) => e.reported) ?? top?.evidence[0];
        return line ? `${line.label}: ${line.value}` : null;
      })(),
      modelVersion: MODEL_VERSION,
    },
    briefPath: input.report
      ? `/internal/brief?a=${encodeURIComponent(input.report)}&s=${input.sessionId}`
      : "",
  };

  // Join the lead to its audit before delivering, so the brief link in the
  // notification lands on a session that already shows the lead state.
  const marked = await pilotStore().markSession(record.sessionId, {
    leadSubmittedAt: record.receivedAt,
  });
  if (!marked.ok) console.warn("[lead] pilot mark failed", marked.error);

  const delivery = await deliverLead(record);

  if (!delivery.delivered) {
    // Every configured sink failed. Say so plainly rather than confirming a
    // request we did not actually record.
    return NextResponse.json(
      {
        ok: false,
        error:
          "We could not record that just now. Please email us directly and we will pick it up.",
      },
      { status: 502 },
    );
  }

  // The response never echoes the submitted values back.
  return NextResponse.json({ ok: true });
}
