/**
 * THRESHOLD PROVENANCE
 *
 * Every number in this product belongs to exactly one of four classes. The
 * distinction matters because a physician is entitled to know which of our
 * numbers are arithmetic, which are our opinion, and which came from data —
 * and today, none came from data.
 *
 *   arithmetic        follows from definitions; not a judgement call
 *   product_judgment  our chosen threshold or curve, defensible but arguable
 *   user_input        the practice told us
 *   benchmark         derived from a real distribution — nothing yet qualifies
 *
 * The benchmark class exists so the layer is built before the data arrives.
 * `BENCHMARKS` is deliberately empty. Adding a fabricated entry to it would
 * defeat the point of the whole design; see BENCHMARKS.md for the contract a
 * real dataset has to satisfy before it can be added.
 */

export type ThresholdProvenance =
  | "arithmetic"
  | "product_judgment"
  | "user_input"
  | "benchmark";

export interface ThresholdRecord {
  id: string;
  label: string;
  provenance: ThresholdProvenance;
  /** How the threshold is expressed, for display. */
  value: string;
  /** Why this value, in one sentence a sceptic can argue with. */
  rationale: string;
  /** Where it bites. */
  usedIn: string;
}

/**
 * Every judgement threshold the engine applies, in one place. If a threshold
 * is not listed here it should not exist in the code.
 */
export const THRESHOLDS: ThresholdRecord[] = [
  {
    id: "ar-working-target",
    label: "A/R working target",
    provenance: "product_judgment",
    value: "35 days",
    rationale:
      "A round operating target we chose, not a published figure. Days above it are treated as working capital in transit rather than as a performance failure.",
    usedIn: "The accounts-receivable finding and its one-time cash estimate.",
  },
  {
    id: "billing-reference-rate",
    label: "Billing cost reference rate",
    provenance: "product_judgment",
    value: "5% of collections",
    rationale:
      "Our reference point for a competitive arrangement. The estimate scales with the spread above it and is capped at four points, so an unusual rate cannot produce a runaway figure.",
    usedIn: "The billing-cost finding.",
  },
  {
    id: "admin-share-floor",
    label: "Physician admin load floor",
    provenance: "product_judgment",
    value: "15% of the work week, and at least 5 hours",
    rationale:
      "Some administrative time is irreducible in medicine. Below this the audit says nothing, because flagging every practice makes the finding meaningless.",
    usedIn: "Whether the physician-time finding fires at all.",
  },
  {
    id: "materiality-share",
    label: "Materiality floor",
    provenance: "product_judgment",
    value: "2% of annual collections",
    rationale:
      "Recurring opportunity below this is not worth an intervention whatever the absolute dollars look like. Prevents a large practice being told to act purely because its percentages translate into big numbers.",
    usedIn: "The healthy verdict, and the sales brief's disqualifiers.",
  },
  {
    id: "aggregate-conservatism-ceiling",
    label: "Aggregate recurring opportunity ceiling",
    provenance: "product_judgment",
    value: "15% of annual collections",
    rationale:
      "Individual findings are each conservative, but they overlap, and summing them produced totals we would not defend — a small practice was shown a recurring range worth 22% of everything it collects. The aggregate is capped and the capping is disclosed; the individual findings are never altered.",
    usedIn: "The rolled-up recurring range in the report and the sales brief.",
  },
  {
    id: "verdict-materiality-confidence",
    label: "Only confident findings affect the verdict",
    provenance: "product_judgment",
    value: "Low-confidence estimates excluded from the materiality test",
    rationale:
      "A low-confidence observation must never be the sole reason we decline to call a practice healthy. Low-confidence findings still appear in the report; they do not get to overrule a clean bill of health.",
    usedIn: "The healthy verdict threshold.",
  },
  {
    id: "score-coverage-floor",
    label: "Score coverage floor",
    provenance: "product_judgment",
    value: "50% of model weight",
    rationale:
      "Below this we publish no overall score. A composite drawn from a quarter of the model is an extrapolation, not a measurement.",
    usedIn: "Whether a Practice Leverage Score is shown at all.",
  },
  {
    id: "impact-bands",
    label: "Impact bands",
    provenance: "product_judgment",
    value: "high at ≥3% of collections, medium at ≥1%",
    rationale:
      "Scaled to the practice rather than to fixed dollars, so a small practice is not told nothing matters and a large one is not told everything does.",
    usedIn: "Ranking and bucketing of every finding.",
  },
  {
    id: "score-curves",
    label: "Dimension scoring curves",
    provenance: "product_judgment",
    value: "Published anchor points per dimension",
    rationale:
      "Interpolated between anchors we chose and print next to the score, so the curve can be argued with rather than trusted.",
    usedIn: "All six score dimensions.",
  },
  {
    id: "booked-slots",
    label: "Booked slots from kept visits",
    provenance: "arithmetic",
    value: "visits ÷ (1 − no-show rate)",
    rationale:
      "Follows from the definition of a no-show rate as a share of booked slots. No judgement involved.",
    usedIn: "The no-show finding.",
  },
  {
    id: "contribution-hour",
    label: "Value of a provider hour",
    provenance: "arithmetic",
    value: "collections per clinical hour × contribution margin",
    rationale:
      "Arithmetic, though the margin it multiplies is a product assumption the user can change.",
    usedIn: "Every time-based figure in the report.",
  },
];

export function thresholdsByProvenance(
  provenance: ThresholdProvenance,
): ThresholdRecord[] {
  return THRESHOLDS.filter((t) => t.provenance === provenance);
}

// ── Benchmark contract ──────────────────────────────────────────────────────

/**
 * A benchmark source must identify itself completely enough that a physician
 * could go and check it. Anything that cannot fill these fields is not a
 * benchmark and must not be presented as one.
 */
export interface BenchmarkSource {
  id: string;
  /** Publishing organisation, e.g. a specialty society or survey. */
  publisher: string;
  /** Title of the specific dataset or report. */
  dataset: string;
  /** Collection year of the underlying data, not the publication year. */
  dataYear: number;
  /** Specialty the distribution describes. Never generalise across specialties. */
  specialty: string;
  /** Number of practices in the sample. Below ~30 we do not show percentiles. */
  sampleSize: number;
  /** Whether we are licensed to display derived figures. */
  licence: "public" | "licensed" | "internal-anonymised";
  url?: string;
}

/**
 * A distribution, not an average. We will show a physician where they sit in a
 * range; we will not tell them what "the average practice" does, because a
 * single central figure hides the variance that makes the comparison useful.
 */
export interface BenchmarkDistribution {
  /** Must match a Metric.key from derive.ts so it can be joined automatically. */
  metricKey: string;
  unit: "currency" | "percent" | "number" | "days";
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  /** Practices contributing to this specific metric, which may be below the source total. */
  n: number;
  source: BenchmarkSource;
  /** Segment the distribution applies to. Null means all practices in the source. */
  segment: { minPhysicians?: number; maxPhysicians?: number } | null;
}

/**
 * Deliberately empty.
 *
 * We do not hold a defensible dermatology benchmark dataset, and inventing one
 * would discredit every other number in the product. When real anonymised data
 * exists, entries land here and the report gains a comparison column — with the
 * source, year, sample size, and segment shown beside every figure.
 */
export const BENCHMARKS: BenchmarkDistribution[] = [];

/** Returns a distribution for a metric, once one legitimately exists. */
export function benchmarkFor(
  metricKey: string,
  physicians: number | null,
): BenchmarkDistribution | undefined {
  return BENCHMARKS.find((b) => {
    if (b.metricKey !== metricKey) return false;
    if (!b.segment) return true;
    if (physicians === null) return false;
    const { minPhysicians = 0, maxPhysicians = Infinity } = b.segment;
    return physicians >= minPhysicians && physicians <= maxPhysicians;
  });
}

/** True while the product ships no benchmark data. Drives report copy. */
export const HAS_BENCHMARKS = BENCHMARKS.length > 0;
