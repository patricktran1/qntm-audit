import { NextResponse } from "next/server";
import { deliverLead } from "@/lib/leads/deliver";
import type { LeadRecord } from "@/lib/leads/types";
import { MODEL_VERSION } from "@/lib/engine/version";
import { internalAuthorised } from "@/lib/internal-auth";
import { pilotStore } from "@/lib/pilot/store";

/**
 * Sends a clearly labelled TEST notification through every configured lead
 * sink, so the operator can verify delivery end to end before real outreach.
 *
 * Deliberately does NOT go through /api/lead and does NOT touch the pilot
 * session store: this is a delivery check, not a lead. The synthetic record
 * is unmistakable — [TEST] in the headline, an invalid email domain, and
 * isTest set — so nobody ever calls it back.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!internalAuthorised(request))
    return NextResponse.json({ ok: false }, { status: 404 });

  const configured = [
    process.env.LEAD_WEBHOOK_URL ? "webhook" : null,
    process.env.LEAD_SLACK_WEBHOOK_URL ? "slack" : null,
  ].filter(Boolean) as string[];

  if (configured.length === 0) {
    return NextResponse.json({
      ok: false,
      configured: [],
      error:
        "No lead sink is configured. Set LEAD_WEBHOOK_URL and/or LEAD_SLACK_WEBHOOK_URL, redeploy, and test again.",
    });
  }

  const now = new Date().toISOString();
  const testLead: LeadRecord = {
    name: "TEST — setup check, do not contact",
    email: "setup-check@test.invalid",
    practiceName: "[TEST] Lead delivery check",
    role: "other",
    location: "",
    website: "",
    concern:
      "This is a delivery test sent from /internal/setup. If you can read this, the sink works. No practice is behind it.",
    nextStep: "not_yet",
    consent: false,
    report: "",
    sessionId: "ps_000000000000000000000000",
    attribution: { source: "setup-check" },
    entryMode: "direct",
    isTest: true,
    receivedAt: now,
    context: {
      verdict: "insufficient_data",
      posture: "none",
      score: null,
      topFinding: null,
      topCategory: null,
      physicians: null,
      opportunityLow: 0,
      opportunityHigh: 0,
      completeness: 0,
      coverage: 0,
      strongestEvidence: null,
      modelVersion: MODEL_VERSION,
    },
    briefPath: "",
  };

  const delivery = await deliverLead(testLead);

  // Remember the result so /internal/setup can show "last test" even after
  // the response is gone. Best effort: with no store this simply isn't kept.
  await pilotStore().putMeta(
    "lead_test",
    JSON.stringify({
      at: now,
      ok: delivery.failures.length === 0 && delivery.sinks.length > 0,
      sinks: delivery.sinks,
      failures: delivery.failures,
    }),
  );

  return NextResponse.json({
    ok: delivery.failures.length === 0 && delivery.sinks.length > 0,
    configured,
    sinks: delivery.sinks,
    failures: delivery.failures,
  });
}
