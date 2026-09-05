import {
  SMALL_SAMPLE,
  assumptionChallenges,
  calibration,
  coverageInsight,
  findingInsight,
  pilotHealth,
  verdictDistribution,
  formatRatio,
} from "./analyse";
import { funnelInsight } from "./analyse";
import type { AuditProgress, DiscoveryOutcome, PilotSession } from "./types";

/**
 * WHAT WE SHOULD LEARN NEXT
 *
 * Deterministic rules over the pilot data. No model, no generated advice — a
 * fixed set of conditions, each of which must attach the metric that triggered
 * it. A recommendation without its evidence is an opinion, and an internal
 * panel full of opinions is a vanity dashboard.
 *
 * Rules are ordered by how much they should change what we do next, and the
 * first rule that fires for a given concern suppresses weaker ones about the
 * same thing.
 */

export type GuidanceSeverity = "blocking" | "investigate" | "watch";

export interface Guidance {
  id: string;
  severity: GuidanceSeverity;
  headline: string;
  /** The metric that triggered this. Always shown. */
  evidence: string;
  action: string;
}

export function pilotGuidance(
  sessions: PilotSession[],
  outcomes: DiscoveryOutcome[],
  progress: AuditProgress[] = [],
): Guidance[] {
  const out: Guidance[] = [];
  const health = pilotHealth(sessions);
  const verdicts = verdictDistribution(sessions);
  const coverage = coverageInsight(sessions);
  const findings = findingInsight(sessions);
  const assumptions = assumptionChallenges(sessions);
  const calib = calibration(sessions, outcomes);
  const funnel = funnelInsight(progress);
  const n = health.completedAudits;

  // Abandonment outranks everything below it: if most people never finish, the
  // completions we do have are a self-selected sample and every rate computed
  // from them is describing the survivors, not the specialty.
  if (funnel.starts >= 5 && funnel.abandonment.numerator / funnel.starts >= 0.4) {
    out.push({
      id: "questionnaire-abandonment",
      severity: "blocking",
      headline: "Most people who start do not finish",
      evidence: `${formatRatio(funnel.abandonment)} of starts abandoned${
        funnel.worstStep
          ? `; the most common stopping point is "${funnel.worstStep.label}" (${funnel.worstStep.stoppedHere} of ${funnel.worstStep.reached} who reached it)`
          : ""
      }.`,
      action:
        "Read the funnel panel before reading any other rate on this page. Completions are a survivor sample until this is understood — and a question people cannot answer is a finding about the specialty, not only about the form.",
    });
  }

  // ── Sample size gates everything ─────────────────────────────────────────
  if (n < SMALL_SAMPLE) {
    out.push({
      id: "sample-too-small",
      severity: "blocking",
      headline: "Too few completed audits to conclude anything",
      evidence: `${n} completed audit${n === 1 ? "" : "s"} (excluding demo and test traffic). Nothing below this line should change the model until there are at least ${SMALL_SAMPLE}.`,
      action:
        "Run outreach. Treat every panel on this page as descriptive until the denominator is real.",
    });
  }

  // ── Model integrity ──────────────────────────────────────────────────────
  if (verdicts.integrityWarning) {
    out.push({
      id: "verdict-integrity",
      severity: "blocking",
      headline: "The verdict distribution looks sales-biased",
      evidence: verdicts.integrityWarning,
      action:
        "Review the materiality floor and the score thresholds before more outreach. Do not tune them to fix a conversion number.",
    });
  }

  if (findings.dominanceWarning) {
    out.push({
      id: "detector-dominance",
      severity: "investigate",
      headline: "One detector is headlining most reports",
      evidence: findings.dominanceWarning,
      action:
        "Inspect that detector's threshold and its significance weighting. A finding that leads every audit teaches a dermatologist that the tool is canned.",
    });
  }

  // ── The audit asks questions physicians cannot answer ─────────────────────
  if (n >= SMALL_SAMPLE && coverage.insufficientRate.numerator / n > 0.3) {
    out.push({
      id: "high-insufficient-data",
      severity: "investigate",
      headline: "The audit is asking for numbers practices do not have",
      evidence: `${formatRatio(coverage.insufficientRate)} of completed audits ended with the verdict withheld for insufficient coverage.`,
      action:
        "Look at the most-skipped questions below. Either the question needs rewording, or not knowing that number is itself the finding and should be said more directly.",
    });
  }

  const worstSkipped = coverage.mostSkipped[0];
  if (n >= SMALL_SAMPLE && worstSkipped && worstSkipped.count / n > 0.5) {
    out.push({
      id: "dominant-skip",
      severity: "investigate",
      headline: `Most practices cannot answer "${worstSkipped.label}"`,
      evidence: `Skipped in ${worstSkipped.count} of ${n} completed audits.`,
      action:
        "Decide whether this question earns its place. If practices genuinely cannot produce it, that is a finding about the specialty, not a gap in the form.",
    });
  }

  // ── Funnel friction ──────────────────────────────────────────────────────
  if (health.ctaClicks >= 5 && health.leads / Math.max(1, health.ctaClicks) < 0.4) {
    out.push({
      id: "cta-to-lead-drop",
      severity: "investigate",
      headline: "People click the CTA and then do not submit",
      evidence: `${formatRatio(health.leadFromCtaRate)} of CTA clicks became a lead submission.`,
      action:
        "The friction is on the lead form, not in the report. Walk it on a phone before changing any copy upstream.",
    });
  }

  // ── Assumption challenges ────────────────────────────────────────────────
  const challenged = assumptions.filter(
    (a) => a.exposed >= SMALL_SAMPLE && a.changed / a.exposed > 0.25,
  );
  for (const a of challenged.slice(0, 2)) {
    out.push({
      id: `assumption-${a.key}`,
      severity: "investigate",
      headline: `Physicians keep moving "${a.label}"`,
      evidence: `Changed in ${formatRatio(a.changeRate)} of reports${
        a.medianDirection && a.medianDirection !== "mixed"
          ? `, usually ${a.medianDirection}wards`
          : ""
      }.`,
      action:
        "This is a prior worth revisiting. A frequently moved assumption is not necessarily wrong — it may mean physician mental models differ from ours, which is worth knowing either way.",
    });
  }

  // ── Calibration, only once outcomes exist ────────────────────────────────
  if (calib.comparable === 0 && n >= SMALL_SAMPLE) {
    out.push({
      id: "no-outcomes",
      severity: "blocking",
      headline: "No discovery outcomes have been recorded",
      evidence: `${n} completed audits, ${calib.labelled} outcome records, ${calib.comparable} with a comparable call.`,
      action:
        "Record an outcome after every conversation from the brief. Without them the model's predictions are untested and this pilot learns nothing.",
    });
  }

  if (calib.comparable >= 5) {
    const agreementShare = calib.agreement.numerator / calib.comparable;
    if (agreementShare < 0.4) {
      out.push({
        id: "prediction-disagreement",
        severity: "investigate",
        headline: "The audit's leading finding often is not the real problem",
        evidence: `Confirmed in ${formatRatio(calib.agreement)} of comparable calls; directionally right in ${formatRatio(calib.directional)}.`,
        action:
          "Inspect the significance weighting that chooses the leading finding. The confusion table shows which category we mistake for which.",
      });
    }

    const tooHigh = calib.economicTally.find((t) => t.key === "too_high")?.count ?? 0;
    if (tooHigh / calib.comparable > 0.3) {
      out.push({
        id: "economics-too-high",
        severity: "investigate",
        headline: "Prospects keep calling the economic estimates too high",
        evidence: `${tooHigh} of ${calib.comparable} comparable calls rated the estimates too high.`,
        action:
          "Lower the contribution margin default or tighten the recapture assumptions. An estimate a physician rejects costs more credibility than a smaller one would have earned.",
      });
    }

    if (calib.serviceFalsePositives.length > 0) {
      const worst = calib.serviceFalsePositives[0]!;
      out.push({
        id: "service-false-positive",
        severity: "watch",
        headline: "A predicted pain is producing irrelevant service fits",
        evidence: `${worst.count} call${worst.count === 1 ? "" : "s"} where we led with ${worst.service} and the conversation concluded no service was relevant.`,
        action:
          "Check that detector before it costs more trust. Attach rate is not the metric being optimised here.",
      });
    }
  }

  if (out.length === 0) {
    out.push({
      id: "nothing-flagged",
      severity: "watch",
      headline: "Nothing in the data is asking for a change right now",
      evidence: `${n} completed audits, ${calib.comparable} comparable discovery calls, no rule triggered.`,
      action: "Keep collecting. Re-check after the next batch of outreach.",
    });
  }

  return out;
}
