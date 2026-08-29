import { EDITABLE_ASSUMPTIONS } from "../engine/assumptions";
import { STEPS } from "../engine/questions";
import type { Category } from "../engine/types";
import type {
  AuditAccuracy,
  CallOutcome,
  DiscoveryOutcome,
  EconomicReaction,
  PilotSession,
  VerdictLevel,
} from "./types";
import { formatAttribution } from "./attribution";

/**
 * PILOT ANALYSIS
 *
 * Deterministic aggregation. No inference, no smoothing, no significance
 * testing — with ten to fifty practices, descriptive statistics are the only
 * honest output, and every figure carries its numerator and denominator so a
 * tiny denominator can never hide behind a percentage.
 *
 * Demo sessions are excluded from everything that feeds learning. A booth
 * demonstration is not evidence about a real practice.
 */

/**
 * The one filter every learning surface shares. Real pilot evidence is a
 * session that is neither a booth demonstration nor QA traffic. Older records
 * predate the isTest field, so the check must tolerate its absence.
 */
export function isRealSession(s: PilotSession): boolean {
  return !s.isDemo && s.isTest !== true;
}

/** A count with its denominator, so the UI can always show `3 / 7 (43%)`. */
export interface Ratio {
  numerator: number;
  denominator: number;
}

export function ratio(numerator: number, denominator: number): Ratio {
  return { numerator, denominator };
}

export function formatRatio(r: Ratio): string {
  if (r.denominator === 0) return "0 / 0";
  const pct = Math.round((r.numerator / r.denominator) * 100);
  return `${r.numerator} / ${r.denominator} (${pct}%)`;
}

/** Below this, any proportion is noise and the UI must say so. */
export const SMALL_SAMPLE = 10;

export function isSmallSample(denominator: number): boolean {
  return denominator < SMALL_SAMPLE;
}

export interface Tally<T extends string> {
  key: T;
  label: string;
  count: number;
}

function tally<T extends string>(
  values: T[],
  keys: readonly T[],
  label: (k: T) => string,
): Tally<T>[] {
  const counts = new Map<T, number>();
  for (const k of keys) counts.set(k, 0);
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].map(([key, count]) => ({
    key,
    label: label(key),
    count,
  }));
}

// ── Pilot health ────────────────────────────────────────────────────────────

export interface PilotHealth {
  completedAudits: number;
  demoSessions: number;
  testSessions: number;
  ctaClicks: number;
  leads: number;
  ctaRate: Ratio;
  leadRate: Ratio;
  leadFromCtaRate: Ratio;
  variantSplit: { variant: string; count: number }[];
  sources: { label: string; count: number }[];
  medianDurationMs: number | null;
}

export function pilotHealth(sessions: PilotSession[]): PilotHealth {
  const real = sessions.filter(isRealSession);
  const ctaClicks = real.filter((s) => s.ctaClickedAt).length;
  const leads = real.filter((s) => s.leadSubmittedAt).length;

  const variants = new Map<string, number>();
  for (const s of real) {
    const key = s.variant ?? "unassigned";
    variants.set(key, (variants.get(key) ?? 0) + 1);
  }

  const sources = new Map<string, number>();
  for (const s of real) {
    const key = formatAttribution(s.attribution);
    sources.set(key, (sources.get(key) ?? 0) + 1);
  }

  const durations = real
    .map((s) => s.durationMs)
    .filter((d): d is number => typeof d === "number" && d > 0)
    .sort((a, b) => a - b);

  return {
    completedAudits: real.length,
    demoSessions: sessions.filter((s) => s.isDemo).length,
    testSessions: sessions.filter((s) => !s.isDemo && s.isTest === true).length,
    ctaClicks,
    leads,
    ctaRate: ratio(ctaClicks, real.length),
    leadRate: ratio(leads, real.length),
    leadFromCtaRate: ratio(leads, ctaClicks),
    variantSplit: [...variants.entries()]
      .map(([variant, count]) => ({ variant, count }))
      .sort((a, b) => a.variant.localeCompare(b.variant)),
    sources: [...sources.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
    medianDurationMs: median(durations),
  };
}

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
    : sorted[mid]!;
}

// ── Verdict distribution ────────────────────────────────────────────────────

const VERDICTS: VerdictLevel[] = ["healthy", "watch", "act", "insufficient_data"];

export interface VerdictDistribution {
  tallies: Tally<VerdictLevel>[];
  total: number;
  /** Among sessions where the model had enough coverage to reach a verdict. */
  sufficient: number;
  actAmongSufficient: Ratio;
  healthyAmongSufficient: Ratio;
  /** Set when the distribution looks sales-biased. Surfaced, never auto-fixed. */
  integrityWarning: string | null;
}

export function verdictDistribution(sessions: PilotSession[]): VerdictDistribution {
  const real = sessions.filter(isRealSession);
  const levels = real.map((s) => s.snapshot.verdict);
  const sufficient = levels.filter((v) => v !== "insufficient_data");
  const acts = sufficient.filter((v) => v === "act").length;
  const healthy = sufficient.filter((v) => v === "healthy").length;

  // The audit is supposed to be able to conclude "do not buy anything". If it
  // almost never does, the model has drifted toward being a sales tool. We
  // surface that and change nothing automatically.
  let integrityWarning: string | null = null;
  if (sufficient.length >= SMALL_SAMPLE) {
    const actShare = acts / sufficient.length;
    if (healthy === 0)
      integrityWarning = `No practice in ${sufficient.length} sufficiently-covered audits has been called healthy. The verdict that lets us decline a sale is not firing — check the materiality and score thresholds before running more outreach.`;
    else if (actShare > 0.85)
      integrityWarning = `${acts} of ${sufficient.length} sufficiently-covered audits reached "act". A model that finds a problem in nearly every practice is indistinguishable from a sales tool.`;
  }

  return {
    tallies: tally(levels, VERDICTS, (k) => k.replace(/_/g, " ")),
    total: real.length,
    sufficient: sufficient.length,
    actAmongSufficient: ratio(acts, sufficient.length),
    healthyAmongSufficient: ratio(healthy, sufficient.length),
    integrityWarning,
  };
}

// ── Coverage ────────────────────────────────────────────────────────────────

export interface CoverageInsight {
  medianCoverage: number | null;
  medianCompleteness: number | null;
  insufficientRate: Ratio;
  /** Questions most often answered "I don't know". */
  mostSkipped: { field: string; label: string; count: number }[];
  /** Score dimensions most often unscored. */
  mostUnscored: { key: string; count: number }[];
}

/** Human labels for answer keys, taken from the question set itself. */
const FIELD_LABELS: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const step of STEPS)
    for (const field of step.fields) out[field.key] = field.label;
  return out;
})();

export function coverageInsight(sessions: PilotSession[]): CoverageInsight {
  const real = sessions.filter(isRealSession);
  const coverages = real.map((s) => s.snapshot.coverage).sort((a, b) => a - b);
  const completes = real.map((s) => s.snapshot.completeness).sort((a, b) => a - b);

  const skipped = new Map<string, number>();
  for (const s of real)
    for (const f of s.snapshot.skippedFields)
      skipped.set(f, (skipped.get(f) ?? 0) + 1);

  const unscored = new Map<string, number>();
  for (const s of real)
    for (const d of s.snapshot.unscoredDimensions)
      unscored.set(d, (unscored.get(d) ?? 0) + 1);

  return {
    medianCoverage: median(coverages),
    medianCompleteness: median(completes),
    insufficientRate: ratio(
      real.filter((s) => s.snapshot.verdict === "insufficient_data").length,
      real.length,
    ),
    mostSkipped: [...skipped.entries()]
      .map(([field, count]) => ({
        field,
        label: FIELD_LABELS[field] ?? field,
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    mostUnscored: [...unscored.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count),
  };
}

// ── Findings ────────────────────────────────────────────────────────────────

export interface FindingInsight {
  /** How often a category appears anywhere in the report. */
  present: { category: Category; count: number }[];
  /** How often a category leads the report. Not the same question. */
  leading: { category: Category; count: number }[];
  /** Flags a detector that leads too often to be believable. */
  dominanceWarning: string | null;
}

export function findingInsight(sessions: PilotSession[]): FindingInsight {
  const real = sessions.filter(isRealSession);
  const present = new Map<Category, number>();
  const leading = new Map<Category, number>();

  for (const s of real) {
    for (const c of s.snapshot.findingCategories)
      present.set(c, (present.get(c) ?? 0) + 1);
    const top = s.snapshot.topCategory;
    if (top) leading.set(top, (leading.get(top) ?? 0) + 1);
  }

  const totalLeading = [...leading.values()].reduce((a, b) => a + b, 0);
  let dominanceWarning: string | null = null;
  if (totalLeading >= SMALL_SAMPLE) {
    for (const [category, count] of leading) {
      if (count / totalLeading > 0.6) {
        dominanceWarning = `${category} leads ${count} of ${totalLeading} reports. A finding that headlines most audits reads as canned; inspect that detector's specificity before the next outreach batch.`;
        break;
      }
    }
  }

  const sortDesc = <T>(m: Map<T, number>, key: string) =>
    [...m.entries()]
      .map(([k, count]) => ({ [key]: k, count }))
      .sort((a, b) => b.count - a.count);

  return {
    present: sortDesc(present, "category") as { category: Category; count: number }[],
    leading: sortDesc(leading, "category") as { category: Category; count: number }[],
    dominanceWarning,
  };
}

// ── Assumption challenges ───────────────────────────────────────────────────

export interface AssumptionChallenge {
  key: string;
  label: string;
  /** Sessions that saw the report at all — every assumption is always exposed. */
  exposed: number;
  changed: number;
  changeRate: Ratio;
  /** Net direction, when one dominates. */
  medianDirection: "up" | "down" | "mixed" | null;
  /** Median magnitude of change, as a share of the default. */
  medianRelativeChange: number | null;
}

export function assumptionChallenges(
  sessions: PilotSession[],
): AssumptionChallenge[] {
  const real = sessions.filter(isRealSession);
  const exposed = real.length;

  return EDITABLE_ASSUMPTIONS.map((meta) => {
    const changes = real
      .flatMap((s) => s.assumptionChanges)
      .filter((c) => c.key === meta.key);
    const ups = changes.filter((c) => c.direction === "up").length;
    const downs = changes.length - ups;

    const relatives = changes
      .filter((c) => c.from !== 0)
      .map((c) => (c.to - c.from) / c.from)
      .sort((a, b) => a - b);

    return {
      key: meta.key as string,
      label: meta.label,
      exposed,
      changed: changes.length,
      changeRate: ratio(changes.length, exposed),
      medianDirection: (changes.length === 0
        ? null
        : ups > downs * 1.5
          ? "up"
          : downs > ups * 1.5
            ? "down"
            : "mixed") as AssumptionChallenge["medianDirection"],
      medianRelativeChange: median(relatives),
    };
  }).sort((a, b) => b.changed - a.changed);
}

// ── Conversion breakdowns ───────────────────────────────────────────────────

export interface ConversionRow {
  label: string;
  sessions: number;
  ctaClicks: Ratio;
  leads: Ratio;
}

function breakdown(
  sessions: PilotSession[],
  keyOf: (s: PilotSession) => string,
): ConversionRow[] {
  const groups = new Map<string, PilotSession[]>();
  for (const s of sessions) {
    const key = keyOf(s);
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return [...groups.entries()]
    .map(([label, group]) => ({
      label,
      sessions: group.length,
      ctaClicks: ratio(group.filter((s) => s.ctaClickedAt).length, group.length),
      leads: ratio(group.filter((s) => s.leadSubmittedAt).length, group.length),
    }))
    .sort((a, b) => b.sessions - a.sessions);
}

export interface ConversionBreakdowns {
  byVerdict: ConversionRow[];
  byTopCategory: ConversionRow[];
  byCoverage: ConversionRow[];
  byVariant: ConversionRow[];
  bySource: ConversionRow[];
}

export function conversionBreakdowns(
  sessions: PilotSession[],
): ConversionBreakdowns {
  const real = sessions.filter(isRealSession);
  const coverageBand = (c: number) =>
    c >= 1 ? "100%" : c >= 0.75 ? "75-99%" : c >= 0.5 ? "50-74%" : "<50%";

  return {
    byVerdict: breakdown(real, (s) => s.snapshot.verdict.replace(/_/g, " ")),
    byTopCategory: breakdown(real, (s) => s.snapshot.topCategory ?? "no finding"),
    byCoverage: breakdown(real, (s) => coverageBand(s.snapshot.coverage)),
    byVariant: breakdown(real, (s) => s.variant ?? "unassigned"),
    bySource: breakdown(real, (s) => formatAttribution(s.attribution)),
  };
}

// ── Calibration ─────────────────────────────────────────────────────────────

export interface CategoryAgreement {
  predicted: Category;
  actual: string;
  count: number;
}

export interface CalibrationSummary {
  labelled: number;
  /** Outcomes where a comparison is possible at all. */
  comparable: number;
  agreement: Ratio;
  directional: Ratio;
  confusion: CategoryAgreement[];
  accuracyTally: Tally<AuditAccuracy>[];
  economicTally: Tally<EconomicReaction>[];
  callOutcomeTally: Tally<CallOutcome>[];
  /** Verdict versus what the conversation suggested. */
  verdictQuality: {
    verdict: VerdictLevel;
    total: number;
    materialWarranted: number;
    minorOnly: number;
    noOpportunity: number;
  }[];
  /** Assumptions named as most challenged on a call. */
  challengedAssumptions: { key: string; label: string; count: number }[];
  /** Services the model rated strong that turned out irrelevant. */
  serviceFalsePositives: { service: string; count: number }[];
  serviceAgreement: Ratio;
}

const ACCURACY_KEYS: AuditAccuracy[] = [
  "confirmed",
  "directionally_correct",
  "secondary_issue",
  "incorrect",
  "unable_to_determine",
];
const ECONOMIC_KEYS: EconomicReaction[] = [
  "credible",
  "directionally_credible",
  "too_high",
  "too_low",
  "not_useful",
  "not_discussed",
];
const CALL_KEYS: CallOutcome[] = [
  "no_call_yet",
  "spoke",
  "follow_up",
  "qualified",
  "not_qualified",
  "not_interested",
  "no_identified_problem",
  "existing_solution_sufficient",
];

export function calibration(
  sessions: PilotSession[],
  outcomes: DiscoveryOutcome[],
): CalibrationSummary {
  const byId = new Map(sessions.map((s) => [s.sessionId, s]));
  const paired = outcomes
    .map((o) => ({ outcome: o, session: byId.get(o.sessionId) }))
    .filter((p): p is { outcome: DiscoveryOutcome; session: PilotSession } =>
      Boolean(p.session && isRealSession(p.session)),
    );

  // Only calls that actually happened can tell us whether we were right.
  const spoken = paired.filter(
    (p) =>
      p.outcome.callOutcome !== "no_call_yet" &&
      p.outcome.auditAccuracy !== "unable_to_determine",
  );

  const confirmed = spoken.filter(
    (p) => p.outcome.auditAccuracy === "confirmed",
  ).length;
  const directional = spoken.filter((p) =>
    ["confirmed", "directionally_correct"].includes(p.outcome.auditAccuracy),
  ).length;

  const confusionMap = new Map<string, CategoryAgreement>();
  for (const p of spoken) {
    const predicted = p.session.snapshot.topCategory;
    if (!predicted) continue;
    const key = `${predicted}→${p.outcome.actualPain}`;
    const existing = confusionMap.get(key);
    if (existing) existing.count += 1;
    else
      confusionMap.set(key, {
        predicted,
        actual: p.outcome.actualPain,
        count: 1,
      });
  }

  const verdictQuality = (["healthy", "watch", "act", "insufficient_data"] as const).map(
    (verdict) => {
      const group = spoken.filter((p) => p.session.snapshot.verdict === verdict);
      return {
        verdict,
        total: group.length,
        materialWarranted: group.filter((p) =>
          ["qualified", "follow_up"].includes(p.outcome.callOutcome),
        ).length,
        minorOnly: group.filter(
          (p) => p.outcome.callOutcome === "existing_solution_sufficient",
        ).length,
        noOpportunity: group.filter((p) =>
          ["no_identified_problem", "not_qualified"].includes(p.outcome.callOutcome),
        ).length,
      };
    },
  );

  const challenged = new Map<string, number>();
  for (const p of paired) {
    const key = p.outcome.mostChallengedAssumption;
    if (key) challenged.set(key, (challenged.get(key) ?? 0) + 1);
  }

  // A service the model rated strong that the conversation found irrelevant is
  // the most costly kind of error: it is where trust is spent for nothing.
  const falsePositives = new Map<string, number>();
  let serviceAgreed = 0;
  for (const p of spoken) {
    if (p.outcome.serviceRelevant === "none") {
      const predicted = p.session.snapshot.topCategory;
      if (predicted) {
        falsePositives.set(predicted, (falsePositives.get(predicted) ?? 0) + 1);
      }
    } else {
      serviceAgreed += 1;
    }
  }

  return {
    labelled: paired.length,
    comparable: spoken.length,
    agreement: ratio(confirmed, spoken.length),
    directional: ratio(directional, spoken.length),
    confusion: [...confusionMap.values()].sort((a, b) => b.count - a.count),
    accuracyTally: tally(
      paired.map((p) => p.outcome.auditAccuracy),
      ACCURACY_KEYS,
      (k) => k.replace(/_/g, " "),
    ),
    economicTally: tally(
      paired.map((p) => p.outcome.economicReaction),
      ECONOMIC_KEYS,
      (k) => k.replace(/_/g, " "),
    ),
    callOutcomeTally: tally(
      paired.map((p) => p.outcome.callOutcome),
      CALL_KEYS,
      (k) => k.replace(/_/g, " "),
    ),
    verdictQuality,
    challengedAssumptions: [...challenged.entries()]
      .map(([key, count]) => ({
        key,
        label: EDITABLE_ASSUMPTIONS.find((a) => a.key === key)?.label ?? key,
        count,
      }))
      .sort((a, b) => b.count - a.count),
    serviceFalsePositives: [...falsePositives.entries()]
      .map(([service, count]) => ({ service, count }))
      .sort((a, b) => b.count - a.count),
    serviceAgreement: ratio(serviceAgreed, spoken.length),
  };
}
