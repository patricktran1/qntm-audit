import type { Bucket, Confidence, Finding, Level } from "./types";
import type { Draft } from "./findings";

/**
 * PRIORITIZATION MATRIX
 *
 * Impact × Effort × Confidence, resolved into four buckets. The ordering rule
 * that matters most: a high-impact finding we are not confident in becomes a
 * measurement task, not a project. That is the difference between a diagnostic
 * and a pitch deck.
 */

const IMPACT_WEIGHT: Record<Level, number> = { high: 3, medium: 2, low: 1 };
const EFFORT_PENALTY: Record<Level, number> = { low: 1, medium: 1.7, high: 2.8 };
const CONFIDENCE_WEIGHT: Record<Confidence, number> = {
  high: 1,
  medium: 0.75,
  low: 0.45,
};

export function bucketFor(
  impact: Level,
  effort: Level,
  confidence: Confidence,
): Bucket {
  // Low confidence means "we may be right, but you should measure before you
  // spend". Never route these to a project bucket regardless of impact.
  if (confidence === "low") {
    return impact === "low" ? "low_priority" : "monitor";
  }
  if (effort === "low" && impact !== "low") return "quick_win";
  if (impact === "high") return "strategic_bet";
  if (impact === "medium") return effort === "high" ? "monitor" : "strategic_bet";
  return "low_priority";
}

/**
 * Dollar magnitude expressed relative to the practice's own collections, so it
 * nudges ordering without letting a large practice's every finding outrank a
 * small practice's crisis. Capped so it can never overturn impact.
 */
function magnitudeTerm(f: Draft, collections: number | null): number {
  const dollars = f.estimate ? Math.max(0, f.estimate.high) : 0;
  if (dollars <= 0) return 0;
  if (!collections || collections <= 0) return Math.min(0.5, dollars / 400_000);
  return Math.min(0.5, (dollars / collections) * 5);
}

/**
 * SIGNIFICANCE — "how loud is this signal?" Impact and confidence only.
 * Drives which findings lead the report, because a physician wants to know what
 * is actually going on before they are told what is easy to fix.
 */
export function significance(f: Draft, collections: number | null): number {
  return (
    IMPACT_WEIGHT[f.impact] * CONFIDENCE_WEIGHT[f.confidence] +
    magnitudeTerm(f, collections)
  );
}

/**
 * RANK — "what should I do first?" Significance divided by effort. Drives the
 * prioritization matrix, which is a different question from the one above.
 */
export function rankScore(f: Draft, collections: number | null = null): number {
  return (
    (IMPACT_WEIGHT[f.impact] * CONFIDENCE_WEIGHT[f.confidence]) /
      EFFORT_PENALTY[f.effort] +
    magnitudeTerm(f, collections)
  );
}

const BUCKET_ORDER: Record<Bucket, number> = {
  quick_win: 0,
  strategic_bet: 1,
  monitor: 2,
  low_priority: 3,
};

export function prioritize(
  drafts: Draft[],
  collections: number | null = null,
): Finding[] {
  return drafts
    .map((f) => ({
      ...f,
      bucket: bucketFor(f.impact, f.effort, f.confidence),
      rank: rankScore(f, collections),
    }))
    .sort((a, b) => {
      const byBucket = BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket];
      if (byBucket !== 0) return byBucket;
      return b.rank - a.rank;
    });
}

export const BUCKET_LABEL: Record<Bucket, string> = {
  quick_win: "Quick wins",
  strategic_bet: "Strategic bets",
  monitor: "Measure first",
  low_priority: "Low priority",
};

export const BUCKET_DESCRIPTION: Record<Bucket, string> = {
  quick_win: "Real impact, low effort, and we are confident in the read.",
  strategic_bet: "Worth doing, but it is a project with a real cost and a timeline.",
  monitor:
    "The signal is there but the data is not strong enough to justify spending against it yet. Measure, then decide.",
  low_priority: "Noted for completeness. Not where your attention belongs.",
};
