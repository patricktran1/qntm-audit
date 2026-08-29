import { isRealSession, ratio, formatRatio, type Ratio } from "./analyse";
import type { DiscoveryOutcome, PilotSession } from "./types";

/**
 * PILOT OPERATIONS
 *
 * The state machine, the follow-up queue, and the stop conditions for running
 * the first cohort. Everything here is a pure function of the stored records:
 * no AI, no scoring, no memory. If a rule fires, its evidence is attached.
 *
 * A deliberate limitation, stated rather than papered over: the pilot only
 * writes a record when an audit is COMPLETED. "Visited" and "started" are not
 * knowable states — there is no server write before completion, by design —
 * so this machine starts at completed and never fabricates the steps before
 * it. Invitation counts are not knowable either: links are generated and sent
 * by hand, outside the product.
 */

// ── Session status ──────────────────────────────────────────────────────────

export type SessionStatus =
  | "completed"
  | "cta_engaged"
  | "lead_submitted"
  | "outcome_recorded";

export const STATUS_LABELS: Record<SessionStatus, string> = {
  completed: "Completed",
  cta_engaged: "CTA engaged",
  lead_submitted: "Lead — discovery pending",
  outcome_recorded: "Outcome recorded",
};

/**
 * The furthest point this session has verifiably reached. An outcome with a
 * real conversation beats everything — an operator can record one for a
 * practice that never submitted the form (a colleague who texted back), and
 * that is still a completed loop.
 */
export function sessionStatus(
  session: PilotSession,
  outcome: DiscoveryOutcome | undefined,
): SessionStatus {
  if (outcome && outcome.callOutcome !== "no_call_yet") return "outcome_recorded";
  if (session.leadSubmittedAt) return "lead_submitted";
  if (session.ctaClickedAt) return "cta_engaged";
  return "completed";
}

// ── Filters ─────────────────────────────────────────────────────────────────

export interface SessionFilter {
  key: string;
  label: string;
  matches: (s: PilotSession, o: DiscoveryOutcome | undefined) => boolean;
}

/**
 * The questions an operator actually asks of the session list. Applied over
 * real sessions only — demo and test rows are shown in the unfiltered list
 * (flagged) but never returned by a learning filter.
 */
export const SESSION_FILTERS: SessionFilter[] = [
  {
    key: "no-lead",
    label: "Completed, no lead",
    matches: (s) => !s.leadSubmittedAt,
  },
  {
    key: "lead",
    label: "Lead submitted",
    matches: (s) => Boolean(s.leadSubmittedAt),
  },
  {
    key: "no-outcome",
    label: "Outcome missing",
    matches: (s, o) =>
      Boolean(s.leadSubmittedAt) && (!o || o.callOutcome === "no_call_yet"),
  },
  {
    key: "insufficient",
    label: "Insufficient data",
    matches: (s) => s.snapshot.verdict === "insufficient_data",
  },
  {
    key: "disagreed",
    label: "Prediction disagreement",
    matches: (_s, o) =>
      Boolean(o && ["incorrect", "secondary_issue"].includes(o.auditAccuracy)),
  },
  {
    key: "economics",
    label: "Economics challenged",
    matches: (_s, o) =>
      Boolean(o && ["too_high", "too_low"].includes(o.economicReaction)),
  },
  {
    key: "healthy",
    label: "Healthy",
    matches: (s) => s.snapshot.verdict === "healthy",
  },
  {
    key: "act",
    label: "Act",
    matches: (s) => s.snapshot.verdict === "act",
  },
];

// ── Needs attention ─────────────────────────────────────────────────────────

export type AttentionKind =
  | "lead_needs_response"
  | "outcome_missing"
  | "economic_disagreement"
  | "prediction_disagreement"
  | "insufficient_data"
  | "data_quality";

export interface AttentionItem {
  kind: AttentionKind;
  headline: string;
  /** What happened, with dates and figures. Never advice. */
  detail: string;
  sessionId: string;
  /** Sortable urgency: smaller is more urgent. */
  order: number;
}

function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000));
}

/**
 * Deterministic follow-up queue. Each rule states what happened and why it
 * needs a human; none of them suggests what to say — that is the operator's
 * job, and PILOT_RUNBOOK.md covers the workflow.
 */
export function needsAttention(
  sessions: PilotSession[],
  outcomes: DiscoveryOutcome[],
): AttentionItem[] {
  const real = sessions.filter(isRealSession);
  const outcomeById = new Map(outcomes.map((o) => [o.sessionId, o]));
  const sessionIds = new Set(sessions.map((s) => s.sessionId));
  const items: AttentionItem[] = [];

  for (const s of real) {
    const o = outcomeById.get(s.sessionId);

    // A lead is a person waiting for a reply. Nothing else outranks it.
    if (s.leadSubmittedAt && !o) {
      const days = daysSince(s.leadSubmittedAt);
      items.push({
        kind: "lead_needs_response",
        headline: "Lead needs a response",
        detail: `Lead submitted ${days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`}; no discovery outcome recorded. Verdict ${s.snapshot.verdict.replace(/_/g, " ")}, leading ${s.snapshot.topCategory ?? "—"}.`,
        sessionId: s.sessionId,
        order: 0,
      });
    }

    // An outcome shell was saved without the conversation itself.
    if (o && o.callOutcome === "no_call_yet") {
      items.push({
        kind: "outcome_missing",
        headline: "Conversation not yet recorded",
        detail: `An outcome record exists but is marked "no call yet" (saved ${daysSince(o.recordedAt)} day${daysSince(o.recordedAt) === 1 ? "" : "s"} ago). The calibration loop is open until the call is captured.`,
        sessionId: s.sessionId,
        order: 1,
      });
    }

    if (o && ["too_high", "too_low"].includes(o.economicReaction)) {
      items.push({
        kind: "economic_disagreement",
        headline: `Economics rated ${o.economicReaction === "too_high" ? "too high" : "too low"}`,
        detail: `The practice challenged the economic range on the call. Opportunity band was ${s.snapshot.opportunityBand}. This is calibration evidence — review the estimate's inputs, and do not adjust the model for one case.`,
        sessionId: s.sessionId,
        order: 2,
      });
    }

    if (o && ["incorrect", "secondary_issue"].includes(o.auditAccuracy)) {
      items.push({
        kind: "prediction_disagreement",
        headline:
          o.auditAccuracy === "incorrect"
            ? "Prediction did not survive the call"
            : "Predicted pain was secondary",
        detail: `Predicted ${s.snapshot.topCategory ?? "—"}; the practice named ${o.actualPain}. Recorded ${daysSince(o.recordedAt)} day${daysSince(o.recordedAt) === 1 ? "" : "s"} ago. Review the disagreement note on the calibration page.`,
        sessionId: s.sessionId,
        order: 3,
      });
    }

    // A withheld verdict may mean the questionnaire failed this practice.
    if (s.snapshot.verdict === "insufficient_data") {
      items.push({
        kind: "insufficient_data",
        headline: "Verdict withheld — was it the questionnaire?",
        detail: `Coverage ${Math.round(s.snapshot.coverage * 100)}%, ${s.snapshot.skippedFields.length} question${s.snapshot.skippedFields.length === 1 ? "" : "s"} unanswered. Worth asking whether they could not answer, or would not.`,
        sessionId: s.sessionId,
        order: 4,
      });
    }
  }

  // An outcome pointing at a session the store does not hold breaks the
  // audit→outcome join that calibration depends on.
  for (const o of outcomes) {
    if (!sessionIds.has(o.sessionId)) {
      items.push({
        kind: "data_quality",
        headline: "Outcome without a stored session",
        detail: `An outcome recorded ${daysSince(o.recordedAt)} day${daysSince(o.recordedAt) === 1 ? "" : "s"} ago references session ${o.sessionId.slice(0, 11)}…, which the store does not hold. Calibration cannot join it. Likely cause: the store was configured after the audit, or the session record was deleted.`,
        sessionId: o.sessionId,
        order: 5,
      });
    }
  }

  return items.sort((a, b) => a.order - b.order);
}

// ── Stop conditions ─────────────────────────────────────────────────────────

export interface StopCondition {
  id: string;
  triggered: boolean;
  title: string;
  /** Numerator / denominator, always. */
  evidence: string;
  /** The guardrail, stated as such. */
  threshold: string;
}

const pausePhrase = "Consider pausing expansion and reviewing this before the next outreach batch.";

/**
 * OPERATOR GUARDRAILS, NOT STATISTICAL INFERENCE.
 *
 * Deterministic conditions under which outreach should pause before the
 * cohort grows. Thresholds are judgment calls made in advance so they cannot
 * be argued with in the moment; at pilot sample sizes none of them is a
 * hypothesis test, which is why every line carries its raw counts. Nothing
 * here stops anything automatically, and nothing here touches the model.
 */
export function stopConditions(
  sessions: PilotSession[],
  outcomes: DiscoveryOutcome[],
): StopCondition[] {
  const real = sessions.filter(isRealSession);
  const outcomeById = new Map(outcomes.map((o) => [o.sessionId, o]));
  const sessionIds = new Set(sessions.map((s) => s.sessionId));

  const sufficient = real.filter((s) => s.snapshot.verdict !== "insufficient_data");
  const acts = sufficient.filter((s) => s.snapshot.verdict === "act").length;
  const healthy = sufficient.filter((s) => s.snapshot.verdict === "healthy").length;

  const insufficient = real.filter(
    (s) => s.snapshot.verdict === "insufficient_data",
  ).length;

  // Only outcomes for real sessions, where the call actually happened.
  const spoken = outcomes.filter((o) => {
    const s = real.find((r) => r.sessionId === o.sessionId);
    return s && o.callOutcome !== "no_call_yet";
  });
  const economicsDiscussed = spoken.filter(
    (o) => !["not_discussed", "not_useful"].includes(o.economicReaction),
  );
  const tooHigh = economicsDiscussed.filter(
    (o) => o.economicReaction === "too_high",
  ).length;
  const comparable = spoken.filter(
    (o) => o.auditAccuracy !== "unable_to_determine",
  );
  const wrong = comparable.filter((o) =>
    ["incorrect", "secondary_issue"].includes(o.auditAccuracy),
  ).length;

  const leading = new Map<string, number>();
  for (const s of real) {
    const top = s.snapshot.topCategory;
    if (top) leading.set(top, (leading.get(top) ?? 0) + 1);
  }
  const totalLeading = [...leading.values()].reduce((a, b) => a + b, 0);
  const dominant = [...leading.entries()].sort((a, b) => b[1] - a[1])[0];

  const leadsNoOutcome = real.filter(
    (s) =>
      s.leadSubmittedAt &&
      (!outcomeById.get(s.sessionId) ||
        outcomeById.get(s.sessionId)!.callOutcome === "no_call_yet"),
  ).length;

  const orphanOutcomes = outcomes.filter((o) => !sessionIds.has(o.sessionId)).length;

  const fmt = (r: Ratio) => formatRatio(r);

  return [
    {
      id: "model-bias",
      triggered:
        sufficient.length >= 8 &&
        (acts / sufficient.length >= 0.85 ||
          (sufficient.length >= 10 && healthy === 0)),
      title: "Possible model bias",
      evidence: `act ${fmt(ratio(acts, sufficient.length))}, healthy ${fmt(ratio(healthy, sufficient.length))} among sufficiently-covered audits.`,
      threshold: `Guardrail: act ≥ 85% of ≥8 covered audits, or zero healthy in ≥10. ${pausePhrase}`,
    },
    {
      id: "questionnaire-failure",
      triggered: real.length >= 5 && insufficient / real.length >= 0.4,
      title: "Questionnaire failure",
      evidence: `Verdict withheld on ${fmt(ratio(insufficient, real.length))} of completed audits.`,
      threshold: `Guardrail: withheld ≥ 40% of ≥5 audits. If real dermatologists cannot answer the questions, the diagnostic is failing before the model runs. ${pausePhrase}`,
    },
    {
      id: "economic-credibility",
      triggered:
        economicsDiscussed.length >= 4 && tooHigh / economicsDiscussed.length >= 0.4,
      title: "Economic credibility failure",
      evidence: `"Too high" on ${fmt(ratio(tooHigh, economicsDiscussed.length))} of calls where economics were discussed.`,
      threshold: `Guardrail: too-high ≥ 40% of ≥4 discussed. Estimates that read as inflated spend trust for nothing. ${pausePhrase}`,
    },
    {
      id: "finding-failure",
      triggered: comparable.length >= 4 && wrong / comparable.length >= 0.5,
      title: "Finding failure",
      evidence: `Prediction incorrect or secondary on ${fmt(ratio(wrong, comparable.length))} of comparable calls.`,
      threshold: `Guardrail: wrong ≥ 50% of ≥4 comparable. If the headline finding usually misses, more outreach collects more misses. ${pausePhrase}`,
    },
    {
      id: "detector-dominance",
      triggered:
        totalLeading >= 8 && dominant !== undefined && dominant[1] / totalLeading > 0.6,
      title: "Detector dominance",
      evidence: dominant
        ? `${dominant[0]} leads ${fmt(ratio(dominant[1], totalLeading))} of reports with a leading finding.`
        : `No reports with a leading finding yet.`,
      threshold: `Guardrail: one category > 60% of ≥8. A finding that headlines most audits reads as canned. ${pausePhrase}`,
    },
    {
      id: "technical-failure",
      triggered: orphanOutcomes > 0,
      title: "Technical failure",
      evidence: `${orphanOutcomes} outcome${orphanOutcomes === 1 ? "" : "s"} cannot be joined to a stored session.`,
      threshold: `Guardrail: any broken audit→outcome join. Check /internal/setup for store health before trusting new data. ${pausePhrase}`,
    },
    {
      id: "follow-up-failure",
      triggered: leadsNoOutcome >= 3,
      title: "Follow-up failure",
      evidence: `${leadsNoOutcome} lead${leadsNoOutcome === 1 ? "" : "s"} with no recorded discovery outcome.`,
      threshold: `Guardrail: ≥3 leads awaiting outcomes. Sending more links while conversations go unrecorded grows the backlog, not the learning. ${pausePhrase}`,
    },
  ];
}

// ── First-ten cohort ────────────────────────────────────────────────────────

export interface CohortSummary {
  cohort: string;
  completions: number;
  leads: Ratio;
  outcomesRecorded: Ratio;
  agreements: Ratio;
  disagreements: Ratio;
  economicsCredible: Ratio;
  economicsChallenged: Ratio;
  assumptionChanges: number;
}

/**
 * Aggregate for one named cohort — with the individual rows always shown
 * beneath it by the page, because at n=10 who disagreed and why matters more
 * than any of these numbers.
 */
export function cohortSummary(
  sessions: PilotSession[],
  outcomes: DiscoveryOutcome[],
  cohort: string,
): CohortSummary {
  const rows = sessions
    .filter(isRealSession)
    .filter((s) => s.attribution.cohort === cohort);
  const outcomeById = new Map(outcomes.map((o) => [o.sessionId, o]));
  const paired = rows
    .map((s) => outcomeById.get(s.sessionId))
    .filter((o): o is DiscoveryOutcome => Boolean(o && o.callOutcome !== "no_call_yet"));
  const comparable = paired.filter((o) => o.auditAccuracy !== "unable_to_determine");
  const discussed = paired.filter(
    (o) => !["not_discussed", "not_useful"].includes(o.economicReaction),
  );

  return {
    cohort,
    completions: rows.length,
    leads: ratio(rows.filter((s) => s.leadSubmittedAt).length, rows.length),
    outcomesRecorded: ratio(paired.length, rows.length),
    agreements: ratio(
      comparable.filter((o) =>
        ["confirmed", "directionally_correct"].includes(o.auditAccuracy),
      ).length,
      comparable.length,
    ),
    disagreements: ratio(
      comparable.filter((o) =>
        ["incorrect", "secondary_issue"].includes(o.auditAccuracy),
      ).length,
      comparable.length,
    ),
    economicsCredible: ratio(
      discussed.filter((o) =>
        ["credible", "directionally_credible"].includes(o.economicReaction),
      ).length,
      discussed.length,
    ),
    economicsChallenged: ratio(
      discussed.filter((o) => ["too_high", "too_low"].includes(o.economicReaction))
        .length,
      discussed.length,
    ),
    assumptionChanges: rows.reduce((sum, s) => sum + s.assumptionChanges.length, 0),
  };
}

/** Cohort values present in the data, most frequent first. */
export function knownCohorts(sessions: PilotSession[]): string[] {
  const counts = new Map<string, number>();
  for (const s of sessions.filter(isRealSession)) {
    const c = s.attribution.cohort;
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}
