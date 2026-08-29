import { currencyExact } from "../format";
import type {
  AuditAnswers,
  Category,
  Finding,
  PracticeScore,
} from "./types";

/**
 * VERDICT
 *
 * The single conclusion the audit is willing to stand behind, and the thing a
 * physician should take away in the first thirty seconds.
 *
 * The important case is `healthy`. An audit that can never conclude "nothing
 * here is worth buying" is not a diagnostic, and a dermatologist can tell the
 * difference within one screen. Deciding this in the engine — rather than in
 * the report component — means the physician's report, the conversion module,
 * and the internal sales brief cannot disagree about it.
 */

export type VerdictLevel = "healthy" | "watch" | "act" | "insufficient_data";

/** How hard, if at all, QNTM should ask for a conversation. */
export type CtaPosture = "none" | "soft" | "standard";

export interface Verdict {
  level: VerdictLevel;
  /** One line, written to be read aloud. */
  headline: string;
  detail: string;
  posture: CtaPosture;
  /** Why we landed here, in the practice's own numbers. */
  basis: string[];
}

/**
 * Recurring opportunity below this share of collections is not worth a major
 * intervention, whatever the absolute dollar figure looks like. Our judgement,
 * chosen so that a large practice cannot be told to act purely because its
 * percentages translate into big numbers.
 */
const IMMATERIAL_SHARE = 0.02;

/** Below this, the audit did not learn enough to conclude anything. */
const MIN_COMPLETENESS = 0.5;

export function buildVerdict(
  answers: AuditAnswers,
  score: PracticeScore,
  findings: Finding[],
  /**
   * The significance-ordered list the report actually leads with. The verdict
   * must name the same finding the reader sees first, so this is passed in
   * rather than re-derived from the bucket-ordered list.
   */
  topOpportunities: Finding[],
  opportunityHigh: number,
  completeness: number,
): Verdict {
  const collections = answers.annualCollections;

  // MATERIALITY USES CONFIDENT VALUE ONLY
  //
  // A low-confidence estimate must never be the sole reason we decline to call
  // a practice healthy. Inflating software spend tenfold on an otherwise
  // excellent practice used to drag it from `healthy` to `watch`, purely
  // through a finding whose own estimate says it "assumes an inventory finds
  // overlapping tools, which is common but not universal". That is the exact
  // shape of a sales bias: a soft observation quietly withdrawing a clean bill
  // of health. Low-confidence findings still appear in the report; they simply
  // do not get to overrule the verdict.
  const confidentHigh = findings
    .filter(
      (f) =>
        f.confidence !== "low" &&
        f.estimate &&
        f.estimate.recurrence === "annual" &&
        f.estimate.kind !== "current_cost",
    )
    .reduce((sum, f) => sum + (f.estimate?.high ?? 0), 0);

  const share =
    collections && collections > 0 ? confidentHigh / collections : null;

  const actionable = findings.filter(
    (f) => f.bucket === "quick_win" || f.bucket === "strategic_bet",
  );
  const isHighImpact = (f: Finding) =>
    actionable.includes(f) && f.impact === "high" && f.confidence !== "low";
  const highImpact = [
    ...topOpportunities.filter(isHighImpact),
    ...actionable.filter((f) => isHighImpact(f) && !topOpportunities.includes(f)),
  ];

  // ── Not enough to conclude anything ──────────────────────────────────────
  if (score.overall === null || completeness < MIN_COMPLETENESS) {
    return {
      level: "insufficient_data",
      headline: "This audit does not yet have enough to give you a verdict.",
      detail:
        "We would rather say that than dress up a partial picture as a diagnosis. What follows is still real — it is computed from what you did tell us — but the gaps at the end of this report are the difference between a hypothesis and a finding.",
      posture: "soft",
      basis: [
        `${Math.round(completeness * 100)}% of questions answered`,
        score.overall === null
          ? `only ${Math.round(score.coverage * 100)}% of the scoring model computable`
          : `${score.scoredCount} of ${score.totalCount} dimensions scored`,
      ],
    };
  }

  // ── Operationally healthy ────────────────────────────────────────────────
  const immaterial = share !== null && share < IMMATERIAL_SHARE;
  if (score.overall >= 78 && highImpact.length === 0 && immaterial) {
    return {
      level: "healthy",
      headline:
        "On the information provided, this practice appears operationally healthy.",
      detail:
        "We would not recommend buying a major intervention on the strength of this audit. The observations below are real but small, and none of them clears the bar where outside help pays for itself. The most useful thing you can do with this report is keep the two or three numbers on it and re-run the audit in six months — a trend will tell you more than this snapshot can.",
      posture: "none",
      basis: [
        `Practice Leverage Score ${score.overall} of 100`,
        `identified recurring opportunity under ${currencyExact(
          (collections ?? 0) * IMMATERIAL_SHARE,
        )} — below 2% of collections`,
        "no high-impact finding we are confident in",
      ],
    };
  }

  // ── Something specific, worth acting on ──────────────────────────────────
  if (highImpact.length > 0) {
    const lead = highImpact[0]!;
    return {
      level: "act",
      headline: `The clearest thing in your numbers is ${lead.title.toLowerCase()}.`,
      detail:
        highImpact.length > 1
          ? `Two findings clear the bar where the arithmetic is strong enough to act on, not just to watch. They are ranked below, along with what each one would cost you to investigate — which in both cases is a week of counting, not a purchase.`
          : "One finding clears the bar where the arithmetic is strong enough to act on rather than merely to watch. Everything else in this report is context for it.",
      posture: "standard",
      basis: [
        `Practice Leverage Score ${score.overall} of 100`,
        `${highImpact.length} high-impact finding${highImpact.length === 1 ? "" : "s"} we are confident in`,
        share !== null
          ? `identified recurring opportunity around ${Math.round(share * 100)}% of collections`
          : "recurring opportunity quantified",
      ],
    };
  }

  // ── Real but modest ──────────────────────────────────────────────────────
  return {
    level: "watch",
    headline:
      "Nothing here is on fire, but a few things are quietly costing you capacity.",
    detail:
      "None of the findings below is large or certain enough on its own to justify an outside engagement. They are worth measuring, and worth re-checking in a couple of quarters — several of them are the kind of thing that only becomes expensive slowly.",
    posture: "soft",
    basis: [
      `Practice Leverage Score ${score.overall} of 100`,
      "no high-impact finding we are confident in",
      `${actionable.length} finding${actionable.length === 1 ? "" : "s"} worth watching`,
    ],
  };
}

// ── Conversion offer ────────────────────────────────────────────────────────

/**
 * The CTA is generated from the verdict and the leading finding, so it can
 * never promise a review of something the audit did not observe — and can
 * decline to ask for the meeting at all.
 */
export interface ConversionOffer {
  posture: CtaPosture;
  eyebrow: string;
  headline: string;
  body: string;
  /** What the review would actually cover. Empty when posture is "none". */
  agenda: string[];
  primaryLabel: string;
  /** Sits under the button. Sets expectations, never sells. */
  footnote: string;
}

/** Review focus by the category of the leading finding. */
const FOCUS: Record<Category, { label: string; agenda: string[] }> = {
  "FRONT OFFICE": {
    label: "an access and phone review",
    agenda: [
      "What your call volume actually consists of, by reason",
      "Where in the day coverage breaks down, and whether that is staffing or scheduling",
      "Which call types could be handled without a person, and which must never be",
    ],
  },
  "PATIENT ACCESS": {
    label: "a scheduling and access review",
    agenda: [
      "Third-next-available split by visit type, rather than blended",
      "Where no-shows concentrate — by lead time, visit type, and payer",
      "Whether the constraint is template design or genuine capacity",
    ],
  },
  "REVENUE OPERATIONS": {
    label: "a collections and A/R review",
    agenda: [
      "A/R aging by payer and by denial reason code",
      "First-pass clean claim rate, and where the rework originates",
      "Whether billing cost is buying performance or just buying capacity",
    ],
  },
  "PHYSICIAN TIME": {
    label: "a clinical workflow review",
    agenda: [
      "Where physician administrative time actually goes, in four buckets",
      "Which of it is documentation, which is inbox, and which is payer-driven",
      "What could move to staff under protocol before anything is automated",
    ],
  },
  OVERHEAD: {
    label: "a cost structure review",
    agenda: [
      "Your real overhead ratio, rebuilt from the P&L rather than our partial figure",
      "Whether the ratio is a cost problem or a schedule-density problem",
      "Where repetitive work is concentrated enough to be worth restructuring",
    ],
  },
  TECHNOLOGY: {
    label: "a systems review",
    agenda: [
      "A full inventory of the stack, with cost, seats, and last configuration date",
      "Which tools removed work and which only added a place to look",
      "What the operating numbers you cannot currently report would take to produce",
    ],
  },
};

export function buildOffer(
  verdict: Verdict,
  topFinding: Finding | undefined,
): ConversionOffer {
  if (verdict.level === "healthy") {
    return {
      posture: "none",
      eyebrow: "Where this leaves us",
      headline: "We do not think you need us right now",
      body: "This audit exists to find operational leverage, and on your numbers there is not enough of it to justify an engagement. That is a real result and we would rather say it than manufacture a project. Keep the report, re-run it in six months, and if something moves in the wrong direction the comparison will be more useful than anything we could tell you today.",
      agenda: [],
      primaryLabel: "Send me the report link",
      footnote:
        "No follow-up sequence, no call. If you would like a second opinion later, the link at the top of this report is all we need.",
    };
  }

  if (verdict.level === "insufficient_data") {
    return {
      posture: "soft",
      eyebrow: "Where this leaves us",
      headline: "The useful next step here is measurement, not a decision",
      body: "You skipped enough of the audit that we would be guessing, and guessing is what makes reports like this worthless. The thirty-day plan above is written to close exactly those gaps, and none of it requires buying anything. If you would rather not chase the numbers yourself, we can help you instrument them — that is a short conversation, not an engagement.",
      agenda: [
        "Which of the missing numbers your existing systems can already produce",
        "What the two or three worth tracking weekly actually are",
        "Whether re-running this audit in a month would change the picture",
      ],
      primaryLabel: "Talk through what to measure",
      footnote:
        "We will read your report before we reply. If the gaps turn out to be nothing, we will tell you that.",
    };
  }

  const focus = topFinding
    ? FOCUS[topFinding.category]
    : FOCUS["REVENUE OPERATIONS"];

  if (verdict.level === "watch") {
    return {
      posture: "soft",
      eyebrow: "Where this leaves us",
      headline: "Worth a second opinion, probably not worth a project",
      body: `Nothing in your numbers rises to the level where we would propose work. If you want to pressure-test the analysis — particularly ${
        topFinding ? topFinding.title.toLowerCase() : "the findings above"
      } — we are happy to go through it with you and tell you honestly if we think it is noise.`,
      agenda: focus.agenda.slice(0, 2),
      primaryLabel: "Pressure-test this analysis",
      footnote:
        "Thirty minutes. We will tell you if we think there is nothing here — that outcome is common and it is fine.",
    };
  }

  return {
    posture: "standard",
    eyebrow: "Where this leaves us",
    headline: `Review these findings with us — starting with ${focus.label}`,
    body: `This audit observed a pattern; it did not prove a cause. ${
      topFinding
        ? `The evidence behind ${topFinding.title.toLowerCase()} is strong enough to be worth an hour of someone's attention, but the next step is still to look at what is underneath it.`
        : "The next step is to look at what is underneath the findings above."
    } We would go through your numbers with you, tell you which of our findings we think survive contact with your reality, and only then talk about whether any of it is worth doing.`,
    agenda: focus.agenda,
    primaryLabel: "Review these findings with us",
    footnote:
      "Thirty minutes, no deck. If we conclude the finding does not hold up, we will say so and there is nothing further to discuss.",
  };
}
