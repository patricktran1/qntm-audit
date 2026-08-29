import type { Derived } from "./derive";
import type {
  Assumptions,
  AuditAnswers,
  Confidence,
  DimensionScore,
  PracticeScore,
} from "./types";

/**
 * PRACTICE LEVERAGE SCORE
 *
 * What it measures: how much of the practice's capacity — physician hours,
 * staff hours, booked slots, collected dollars — is actually converted into
 * patient care and revenue, versus absorbed by friction.
 *
 * What it is NOT: a comparison against other practices. We ship no benchmark
 * data set. Each dimension is scored against an explicitly published curve,
 * printed in the report next to the score, so a practice administrator can
 * disagree with the curve rather than having to trust a black box.
 *
 * A low score means there is leverage available, not that the practice is bad.
 */

/**
 * Minimum share of the scoring model's weight that must be computable before we
 * publish an overall number. A composite drawn from a quarter of the model is
 * not a score, it is an extrapolation.
 */
export const MIN_SCORE_COVERAGE = 0.5;

/** Piecewise-linear interpolation across published anchor points. */
export function scoreFromAnchors(
  value: number,
  anchors: [number, number][],
): number {
  if (anchors.length === 0) return 0;
  const first = anchors[0]!;
  const last = anchors[anchors.length - 1]!;
  if (value <= first[0]) return first[1];
  if (value >= last[0]) return last[1];
  for (let i = 0; i < anchors.length - 1; i++) {
    const lo = anchors[i]!;
    const hi = anchors[i + 1]!;
    if (value >= lo[0] && value <= hi[0]) {
      const span = hi[0] - lo[0];
      if (span === 0) return hi[1];
      const t = (value - lo[0]) / span;
      return lo[1] + t * (hi[1] - lo[1]);
    }
  }
  return last[1];
}

const describe = (anchors: [number, number][], unit: string): string =>
  anchors.map(([x, s]) => `${x}${unit} → ${Math.round(s)}`).join("  ·  ");

/** Combine sub-signals, ignoring the ones we could not compute. */
function blend(parts: { score: number | null; weight: number }[]): {
  score: number | null;
  coverage: number;
} {
  const present = parts.filter((p) => p.score !== null);
  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  if (present.length === 0 || totalWeight === 0)
    return { score: null, coverage: 0 };
  const presentWeight = present.reduce((s, p) => s + p.weight, 0);
  const weighted = present.reduce((s, p) => s + p.score! * p.weight, 0);
  return { score: weighted / presentWeight, coverage: presentWeight / totalWeight };
}

const confFromCoverage = (c: number): Confidence =>
  c >= 0.99 ? "high" : c >= 0.5 ? "medium" : "low";

const NO_SHOW_ANCHORS: [number, number][] = [
  [0, 100],
  [4, 90],
  [8, 72],
  [12, 55],
  [18, 35],
  [25, 18],
  [40, 0],
];

const TNA_ANCHORS: [number, number][] = [
  [0, 100],
  [7, 92],
  [14, 78],
  [21, 62],
  [35, 42],
  [60, 20],
  [120, 0],
];

const UNANSWERED_ANCHORS: [number, number][] = [
  [0, 100],
  [5, 88],
  [10, 72],
  [18, 52],
  [25, 35],
  [40, 12],
  [60, 0],
];

const CALLS_PER_FTE_ANCHORS: [number, number][] = [
  [10, 100],
  [30, 90],
  [50, 72],
  [70, 52],
  [90, 32],
  [120, 12],
  [180, 0],
];

const PHONE_CAPACITY_ANCHORS: [number, number][] = [
  [0, 100],
  [0.25, 88],
  [0.4, 70],
  [0.55, 48],
  [0.7, 28],
  [0.9, 8],
  [1.2, 0],
];

// Anchored to the reality that some administrative time is irreducible in
// medicine. The curve turns sharply past ~25%, where the work stops fitting
// inside the working day.
const ADMIN_SHARE_ANCHORS: [number, number][] = [
  [0, 100],
  [0.1, 90],
  [0.18, 74],
  [0.25, 58],
  [0.33, 40],
  [0.45, 18],
  [0.6, 0],
];

const AR_ANCHORS: [number, number][] = [
  [15, 100],
  [30, 88],
  [40, 72],
  [50, 55],
  [65, 35],
  [90, 12],
  [140, 0],
];

const BILLING_PCT_ANCHORS: [number, number][] = [
  [2, 100],
  [4, 88],
  [5.5, 74],
  [7, 55],
  [8.5, 35],
  [10, 18],
  [14, 0],
];

const OVERHEAD_ANCHORS: [number, number][] = [
  [0.1, 100],
  [0.18, 88],
  [0.25, 72],
  [0.32, 55],
  [0.4, 35],
  [0.5, 15],
  [0.65, 0],
];

// Share of collections, not dollars per provider: software carries large fixed
// components, so a per-provider figure penalises small practices for their size.
const SOFTWARE_SHARE_ANCHORS: [number, number][] = [
  [0.005, 100],
  [0.01, 90],
  [0.02, 74],
  [0.03, 55],
  [0.045, 32],
  [0.06, 12],
  [0.09, 0],
];

const PRIOR_AUTH_ANCHORS: [number, number][] = [
  [0, 100],
  [0.05, 90],
  [0.12, 72],
  [0.2, 52],
  [0.3, 30],
  [0.45, 10],
  [0.6, 0],
];

/**
 * Whether the practice supplied enough of the audit's required inputs for the
 * "could you report this metric?" signal to mean anything. Without this guard
 * an abandoned audit scores 0 on visibility and reports a confident, terrible
 * overall score — which is the single fastest way to lose a physician's trust.
 */
function hasCoreAnswers(a: AuditAnswers): boolean {
  return (
    a.physicians !== null &&
    a.annualCollections !== null &&
    a.clinicalDaysPerWeek !== null &&
    a.patientsPerProviderPerDay !== null
  );
}

export function computeScore(
  a: AuditAnswers,
  k: Assumptions,
  d: Derived,
): PracticeScore {
  const dims: DimensionScore[] = [];

  // ── PATIENT ACCESS ────────────────────────────────────────────────────────
  {
    const noShow =
      a.noShowRate !== null ? scoreFromAnchors(a.noShowRate, NO_SHOW_ANCHORS) : null;
    const tna =
      a.thirdNextAvailableDays !== null
        ? scoreFromAnchors(a.thirdNextAvailableDays, TNA_ANCHORS)
        : null;
    const { score, coverage } = blend([
      { score: noShow, weight: 0.5 },
      { score: tna, weight: 0.5 },
    ]);
    const bits: string[] = [];
    if (a.noShowRate !== null) bits.push(`${a.noShowRate}% no-show/same-day cancel rate`);
    if (a.thirdNextAvailableDays !== null)
      bits.push(`${a.thirdNextAvailableDays}-day third-next-available`);
    dims.push({
      key: "access",
      label: "Patient access",
      category: "PATIENT ACCESS",
      weight: 18,
      score,
      confidence: confFromCoverage(coverage),
      rationale: bits.length
        ? `Scored on ${bits.join(" and ")}.`
        : "Not scored — no-show rate and appointment wait were both skipped.",
      anchors: `No-show: ${describe(NO_SHOW_ANCHORS, "%")}. Third-next-available: ${describe(TNA_ANCHORS, "d")}.`,
    });
  }

  // ── FRONT OFFICE ──────────────────────────────────────────────────────────
  {
    const unanswered =
      a.unansweredCallPercent !== null
        ? scoreFromAnchors(a.unansweredCallPercent, UNANSWERED_ANCHORS)
        : null;
    const perFte =
      d.callsPerFrontOfficeFtePerDay !== null
        ? scoreFromAnchors(d.callsPerFrontOfficeFtePerDay, CALLS_PER_FTE_ANCHORS)
        : null;
    const capacity =
      d.callShareOfFrontOfficeCapacity !== null
        ? scoreFromAnchors(d.callShareOfFrontOfficeCapacity, PHONE_CAPACITY_ANCHORS)
        : null;
    const { score, coverage } = blend([
      { score: unanswered, weight: 0.45 },
      { score: perFte, weight: 0.3 },
      { score: capacity, weight: 0.25 },
    ]);
    const bits: string[] = [];
    if (a.unansweredCallPercent !== null)
      bits.push(`${a.unansweredCallPercent}% of calls unanswered`);
    if (d.callsPerFrontOfficeFtePerDay !== null)
      bits.push(`${Math.round(d.callsPerFrontOfficeFtePerDay)} calls per front-office FTE per day`);
    dims.push({
      key: "front_office",
      label: "Front-office leverage",
      category: "FRONT OFFICE",
      weight: 15,
      score,
      confidence: coverage >= 0.99 ? "medium" : confFromCoverage(coverage),
      rationale: bits.length
        ? `Scored on ${bits.join(" and ")}.`
        : "Not scored — call volume and answer rate were skipped.",
      anchors: `Unanswered: ${describe(UNANSWERED_ANCHORS, "%")}. Calls per FTE/day: ${describe(CALLS_PER_FTE_ANCHORS, "")}.`,
    });
  }

  // ── PHYSICIAN TIME ────────────────────────────────────────────────────────
  {
    const share =
      d.physicianAdminShareOfWorkWeek !== null
        ? scoreFromAnchors(d.physicianAdminShareOfWorkWeek, ADMIN_SHARE_ANCHORS)
        : null;
    const { score, coverage } = blend([{ score: share, weight: 1 }]);
    dims.push({
      key: "physician_time",
      label: "Physician time",
      category: "PHYSICIAN TIME",
      weight: 22,
      score,
      confidence: confFromCoverage(coverage),
      rationale:
        d.physicianAdminShareOfWorkWeek !== null
          ? `${a.physicianAdminHoursPerWeek} admin hours per week against ${
              (a.clinicalDaysPerWeek ?? 0) * k.hoursPerClinicalDay
            } scheduled clinical hours — ${Math.round(
              d.physicianAdminShareOfWorkWeek * 100,
            )}% of the physician work week is non-clinical.`
          : "Not scored — physician admin hours were skipped.",
      anchors: `Admin share of physician work week: ${describe(
        ADMIN_SHARE_ANCHORS.map(([x, s]) => [Math.round(x * 100), s] as [number, number]),
        "%",
      )}.`,
    });
  }

  // ── REVENUE OPERATIONS ────────────────────────────────────────────────────
  {
    const ar = a.daysInAR !== null ? scoreFromAnchors(a.daysInAR, AR_ANCHORS) : null;
    const pct =
      a.billingPercent !== null &&
      (a.billingModel === "outsourced" || a.billingModel === "hybrid")
        ? scoreFromAnchors(a.billingPercent, BILLING_PCT_ANCHORS)
        : null;
    // In-house billing has no fee percentage; score its cost as a share of
    // collections on the same curve so the two models stay comparable.
    const inHouseEquivalent =
      pct === null && d.billingCost !== null && a.annualCollections
        ? scoreFromAnchors((d.billingCost / a.annualCollections) * 100, BILLING_PCT_ANCHORS)
        : null;
    const { score, coverage } = blend([
      { score: ar, weight: 0.55 },
      { score: pct ?? inHouseEquivalent, weight: 0.45 },
    ]);
    const bits: string[] = [];
    if (a.daysInAR !== null) bits.push(`${a.daysInAR} days in A/R`);
    if (pct !== null) bits.push(`${a.billingPercent}% billing fee`);
    else if (inHouseEquivalent !== null && d.billingCost && a.annualCollections)
      bits.push(
        `in-house billing costing ${((d.billingCost / a.annualCollections) * 100).toFixed(1)}% of collections`,
      );
    dims.push({
      key: "revenue_ops",
      label: "Revenue operations",
      category: "REVENUE OPERATIONS",
      weight: 18,
      score,
      confidence: confFromCoverage(coverage),
      rationale: bits.length
        ? `Scored on ${bits.join(" and ")}.`
        : "Not scored — days in A/R and billing cost were both unavailable.",
      anchors: `Days in A/R: ${describe(AR_ANCHORS, "d")}. Billing cost as % of collections: ${describe(BILLING_PCT_ANCHORS, "%")}.`,
    });
  }

  // ── OVERHEAD ──────────────────────────────────────────────────────────────
  {
    const oh =
      d.overheadShare !== null ? scoreFromAnchors(d.overheadShare, OVERHEAD_ANCHORS) : null;
    const pa =
      d.priorAuthHoursPerYear !== null && d.providers
        ? scoreFromAnchors(
            d.priorAuthHoursPerYear / (k.workingHoursPerFteYear * d.providers),
            PRIOR_AUTH_ANCHORS,
          )
        : null;
    const { score, coverage } = blend([
      { score: oh, weight: 0.7 },
      { score: pa, weight: 0.3 },
    ]);
    dims.push({
      key: "overhead",
      label: "Overhead load",
      category: "OVERHEAD",
      weight: 17,
      score,
      confidence: confFromCoverage(coverage),
      rationale:
        d.overheadShare !== null
          ? `Staff, billing, and software consume ${Math.round(
              d.overheadShare * 100,
            )}% of collections before rent, supplies, malpractice, or physician pay.`
          : "Not scored — insufficient cost inputs.",
      anchors: `Identified overhead share: ${describe(
        OVERHEAD_ANCHORS.map(([x, s]) => [Math.round(x * 100), s] as [number, number]),
        "%",
      )}.`,
    });
  }

  // ── TECHNOLOGY ────────────────────────────────────────────────────────────
  {
    const softwareShare =
      d.softwareCost !== null && a.annualCollections
        ? d.softwareCost / a.annualCollections
        : null;
    const spend =
      softwareShare !== null
        ? scoreFromAnchors(softwareShare, SOFTWARE_SHARE_ANCHORS)
        : null;
    // Not knowing your own operating numbers is itself a technology finding:
    // it usually means the stack does not report them.
    const trackable: (number | null)[] = [
      a.daysInAR,
      a.noShowRate,
      a.callsPerDay,
      a.unansweredCallPercent,
      a.thirdNextAvailableDays,
    ];
    const known = trackable.filter((v) => v !== null).length;
    const visibility = hasCoreAnswers(a) ? (known / trackable.length) * 100 : null;
    const { score, coverage } = blend([
      { score: spend, weight: 0.45 },
      { score: visibility, weight: 0.55 },
    ]);
    dims.push({
      key: "technology",
      label: "Technology & visibility",
      category: "TECHNOLOGY",
      weight: 10,
      score,
      confidence: confFromCoverage(coverage),
      rationale: !hasCoreAnswers(a) && spend === null
        ? "Not scored — the audit was not completed far enough to judge."
        : `You could report ${known} of 5 core operating metrics${
        softwareShare !== null
          ? `, with software at ${(softwareShare * 100).toFixed(1)}% of collections`
          : ""
      }. ${
        known === trackable.length
          ? "Metrics your stack cannot produce are metrics you cannot manage — yours produces all five."
          : "This scores skipped answers as untracked, which is the pessimistic reading. If you do have these numbers and simply did not have them to hand, re-run with them and this dimension will move."
      }`,
      anchors: `Software as % of collections: ${describe(
        SOFTWARE_SHARE_ANCHORS.map(([x, sc]) => [Number((x * 100).toFixed(1)), sc] as [number, number]),
        "%",
      )}. Operating-metric visibility scored linearly, 0–5 metrics.`,
    });
  }

  const scored = dims.filter((x) => x.score !== null);
  const totalWeight = dims.reduce((s, x) => s + x.weight, 0);
  const scoredWeight = scored.reduce((s, x) => s + x.weight, 0);
  const coverage = totalWeight === 0 ? 0 : scoredWeight / totalWeight;

  // Below this, a composite would be extrapolating from a minority of the
  // practice and would read far more confident than the data supports. We
  // publish the dimensions we could score and withhold the headline number.
  const overall =
    scoredWeight === 0 || coverage < MIN_SCORE_COVERAGE
      ? null
      : scored.reduce((s, x) => s + x.score! * x.weight, 0) / scoredWeight;

  // Band from the rounded value, so a displayed 65 never reads as the band
  // belonging to 64.6.
  const rounded = overall === null ? null : Math.round(overall);
  const { band, bandDescription } =
    overall === null && scoredWeight > 0
      ? {
          band: "Not enough answered to score",
          bandDescription: `Only ${Math.round(
            coverage * 100,
          )}% of the scoring model could be computed from your answers. The dimensions below are real; a single headline number built on this little would read more confident than the data supports.`,
        }
      : bandFor(rounded);

  return {
    overall: rounded,
    band,
    bandDescription,
    dimensions: dims,
    coverage,
    scoredCount: scored.length,
    totalCount: dims.length,
  };
}

export function bandFor(overall: number | null): {
  band: string;
  bandDescription: string;
} {
  if (overall === null)
    return {
      band: "Not scored",
      bandDescription: "Not enough inputs to score this practice honestly.",
    };
  if (overall >= 80)
    return {
      band: "Tight operation",
      bandDescription:
        "The obvious leaks are closed. Remaining gains come from structural changes, not fixes.",
    };
  if (overall >= 65)
    return {
      band: "Solid, with named gaps",
      bandDescription:
        "The practice runs well. One or two specific systems are absorbing more capacity than they should.",
    };
  if (overall >= 50)
    return {
      band: "Meaningful drag",
      bandDescription:
        "Several systems are consuming capacity that could be returned to clinical work.",
    };
  return {
    band: "Substantial leverage available",
    bandDescription:
      "Multiple dimensions show capacity leaving the practice. Sequence matters more than effort here.",
  };
}
