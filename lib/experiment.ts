import type { Variant } from "./analytics";

/**
 * HEADLINE EXPERIMENT
 *
 * Two legitimate framings of the same product, not a copy tweak:
 *
 *   A — the score. "Here is a measurement of your practice."
 *   B — the economics. "Here is what an hour of your time is worth, and how
 *       much of it you are spending outside the exam room."
 *
 * The hypothesis is that B travels further in conversation, because a
 * dollars-per-hour figure is repeatable to a partner and a 0–100 score is not.
 *
 * Everything after the hero is identical in both arms. Only the framing above
 * the fold and the primary promise change, so a difference in completion or
 * conversion is attributable to the framing rather than to the product.
 */

export interface LandingCopy {
  variant: Variant;
  eyebrow: string;
  /** Rendered as two lines. */
  headline: [string, string];
  subhead: string;
  ctaLabel: string;
  /** The four figures under the hero. */
  stats: [string, string][];
  /** Heading for the sample-excerpt card. */
  sampleEyebrow: string;
  closingHeadline: string;
}

export function landingCopy(variant: Variant, questionCount: number, stepCount: number): LandingCopy {
  if (variant === "B") {
    return {
      variant,
      eyebrow: "Operational diagnostic · Independent dermatology",
      headline: ["What is an hour", "of your time worth?"],
      subhead:
        `Not a rule of thumb — a figure computed from your own collections, clinic days, and hours. Answer ${questionCount} questions and we will calculate it, then show you how much of your week is currently spent outside the exam room and what that is costing.`,
      ctaLabel: "Calculate my hourly value",
      stats: [
        ["$/hr", "your time, from your numbers"],
        [String(questionCount), "questions"],
        ["~5", "minutes"],
        ["0", "industry benchmarks used"],
      ],
      sampleEyebrow: "Excerpt · Sample report",
      closingHeadline:
        "Find out what an hour of your attention is actually worth",
    };
  }
  return {
    variant: "A",
    eyebrow: "Operational diagnostic · Independent dermatology",
    headline: ["Your practice,", "decoded."],
    subhead:
      `Answer ${questionCount} questions about how your practice actually runs. Get a Practice Leverage Score across six dimensions, and a specific read on where physician time, staff capacity, and collected revenue are leaking.`,
    ctaLabel: "Start audit",
    stats: [
      [String(questionCount), "questions"],
      [String(stepCount), "short screens"],
      ["~5", "minutes"],
      ["0", "industry benchmarks used"],
    ],
    sampleEyebrow: "Excerpt · Sample report",
    closingHeadline:
      "Find out what your practice is actually spending its capacity on",
  };
}
