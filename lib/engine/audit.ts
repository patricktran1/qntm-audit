import { currencyExact, num, rawPercent } from "../format";
import { DEFAULT_ASSUMPTIONS } from "./assumptions";
import { automationCandidates } from "./automation";
import { buildMetrics, derive } from "./derive";
import { runDetectors } from "./findings";
import { prioritize, significance } from "./prioritize";
import { completeness } from "./questions";
import { computeScore } from "./score";
import type {
  ActionItem,
  Assumptions,
  AuditAnswers,
  AuditResult,
  Finding,
  OpenQuestion,
} from "./types";

/** Run the whole audit. Pure function — same inputs, same report, every time. */
export function runAudit(
  answers: AuditAnswers,
  assumptions: Assumptions = DEFAULT_ASSUMPTIONS,
): AuditResult {
  const d = derive(answers, assumptions);
  const metrics = buildMetrics(answers, assumptions, d);
  const score = computeScore(answers, assumptions, d);
  const findings = prioritize(
    runDetectors(answers, assumptions, d),
    answers.annualCollections,
  );
  const topOpportunities = selectTop(findings, answers.annualCollections);
  const automation = automationCandidates(answers, assumptions, d, findings);

  // Only recoverable cash and freed capacity roll up. Current costs are what
  // the practice already spends — counting them as "opportunity" is the oldest
  // trick in consulting and it is why these reports get thrown away.
  // One-time cash releases are totalled separately from recurring value for
  // the same reason.
  const countable = findings.filter(
    (f) => f.estimate && f.estimate.kind !== "current_cost",
  );
  const annual = countable.filter((f) => f.estimate!.recurrence === "annual");
  const oneTime = countable.filter((f) => f.estimate!.recurrence === "one_time");
  const opportunityLow = annual.reduce((s, f) => s + (f.estimate?.low ?? 0), 0);
  const opportunityHigh = annual.reduce((s, f) => s + (f.estimate?.high ?? 0), 0);
  const oneTimeLow = oneTime.reduce((s, f) => s + (f.estimate?.low ?? 0), 0);
  const oneTimeHigh = oneTime.reduce((s, f) => s + (f.estimate?.high ?? 0), 0);

  return {
    answers,
    assumptions,
    metrics,
    score,
    findings,
    topOpportunities,
    openQuestions: openQuestions(answers, findings),
    plan: thirtyDayPlan(topOpportunities, answers),
    executiveSummary: executiveSummary(answers, d, score, topOpportunities, {
      low: opportunityLow,
      high: opportunityHigh,
      count: annual.length,
    }),
    opportunityLow,
    opportunityHigh,
    oneTimeLow,
    oneTimeHigh,
    quantifiedCount: annual.length,
    automationCandidates: automation,
    completeness: completeness(answers),
  };
}

/**
 * Top opportunities are capped at 4, ordered by significance rather than by
 * ease, and drawn across categories so the report does not return four
 * versions of the same phone problem. Sequencing is the matrix's job, not this
 * list's — leading with whatever is cheapest to fix buries the actual finding.
 */
function selectTop(findings: Finding[], collections: number | null): Finding[] {
  const bySignificance = [...findings].sort(
    (a, b) => significance(b, collections) - significance(a, collections),
  );
  const chosen: Finding[] = [];
  const usedCategories = new Set<string>();
  for (const f of bySignificance) {
    if (chosen.length >= 4) break;
    if (f.bucket === "low_priority") continue;
    if (usedCategories.has(f.category)) continue;
    chosen.push(f);
    usedCategories.add(f.category);
  }
  // Backfill if category diversity left us short.
  for (const f of bySignificance) {
    if (chosen.length >= 3) break;
    if (f.bucket === "low_priority") continue;
    if (chosen.includes(f)) continue;
    chosen.push(f);
  }
  return chosen;
}

/** What the audit could not answer, and why it matters. */
function openQuestions(a: AuditAnswers, findings: Finding[]): OpenQuestion[] {
  const q: OpenQuestion[] = [];

  if (a.daysInAR === null)
    q.push({
      question: "What are your days in A/R, and what does the aging look like past 90 days?",
      why: "Without this we cannot tell whether revenue is being lost or merely delayed. They have different fixes and very different urgency.",
      category: "REVENUE OPERATIONS",
    });
  if (a.callsPerDay === null)
    q.push({
      question: "How many inbound calls do you take on a normal clinic day, and how many go unanswered?",
      why: "Phone volume is the single most predictive number for front-office strain, and almost every phone system reports it already.",
      category: "FRONT OFFICE",
    });
  else if (a.unansweredCallPercent === null)
    q.push({
      question: "What share of your inbound calls are abandoned or go to voicemail?",
      why: "Call volume without an answer rate tells us the workload but not the leak.",
      category: "FRONT OFFICE",
    });
  if (a.noShowRate === null)
    q.push({
      question: "What is your no-show and same-day cancellation rate, split by visit type?",
      why: "Missed slots are usually the cheapest capacity in the practice to recover, but only if the rate is concentrated somewhere specific.",
      category: "PATIENT ACCESS",
    });
  if (a.thirdNextAvailableDays === null)
    q.push({
      question: "How far out is your third-next-available new patient appointment?",
      why: "This is the cleanest single measure of whether demand is being converted or turned away.",
      category: "PATIENT ACCESS",
    });
  if (a.physicianAdminHoursPerWeek === null)
    q.push({
      question: "How many hours a week does each physician spend on charting, inbox, and forms?",
      why: "This is the input that prices every other decision, because it establishes what an hour of physician attention is worth here.",
      category: "PHYSICIAN TIME",
    });

  // Questions the numbers raise even when everything was answered.
  if (findings.some((f) => f.id === "no-show-leakage" || f.id === "access-delay"))
    q.push({
      question: "Of the patients who no-show, how many are rebooked within 30 days?",
      why: "A missed slot that rebooks is a scheduling inefficiency. One that never rebooks is lost revenue and a lost relationship.",
      category: "PATIENT ACCESS",
    });
  if (findings.some((f) => f.id === "billing-cost" || f.id === "ar-aging"))
    q.push({
      question: "What is your first-pass clean claim rate, and which denial codes dominate?",
      why: "This distinguishes a billing performance problem from a front-end data-capture problem. The second is far cheaper to fix.",
      category: "REVENUE OPERATIONS",
    });
  q.push({
    question: "What share of collections comes from procedures, pathology, and cosmetic work versus office visits?",
    why: "Payer mix and service mix drive collections per visit more than efficiency does. This audit intentionally does not guess at yours.",
    category: "REVENUE OPERATIONS",
  });

  return q.slice(0, 6);
}

/** A short, specific plan. Measurement first — nothing here requires a purchase. */
function thirtyDayPlan(top: Finding[], a: AuditAnswers): ActionItem[] {
  const plan: ActionItem[] = [];

  if (top[0])
    plan.push({
      week: "Week 1",
      action: top[0].nextStep,
      owner: "Practice manager",
      unlocks: `Confirms or kills the largest finding in this report (${top[0].title.toLowerCase()}) before any money is committed.`,
    });
  else
    plan.push({
      week: "Week 1",
      action:
        "Pull the five operating numbers this audit asked for and could not get: days in A/R, no-show rate, inbound call volume, unanswered call rate, and third-next-available appointment. Four of the five come out of systems you already pay for.",
      owner: "Practice manager",
      unlocks:
        "Without these there is nothing to diagnose. Whether your systems can produce them at all is the first finding.",
    });

  if (a.callsPerDay !== null || a.unansweredCallPercent !== null)
    plan.push({
      week: "Week 1",
      action:
        "Pull a call report from your phone system: total inbound, answered, abandoned, and average time to answer, by hour of day.",
      owner: "Front office lead",
      unlocks:
        "Shows whether the phone problem is volume or coverage. If abandons cluster at 8–10am and lunch, it is a scheduling problem, not a headcount problem.",
    });

  plan.push({
    week: "Week 2",
    action:
      "Tag every inbound call by reason for five consecutive clinic days. Six categories, one tally sheet, no software required.",
    owner: "Front office",
    unlocks:
      "Replaces the softest assumption in this report with a real number, and identifies which call types could be handled without a person.",
  });

  if (top[1])
    plan.push({
      week: "Week 2",
      action: top[1].nextStep,
      owner: "Practice manager",
      unlocks: `Tests the second finding (${top[1].title.toLowerCase()}) with data you already have.`,
    });

  if (a.physicianAdminHoursPerWeek !== null && a.physicianAdminHoursPerWeek >= 5)
    plan.push({
      week: "Week 3",
      action:
        "Each physician logs administrative time for one week in four buckets: notes, inbox and results, refills, and forms or prior auth.",
      owner: "Physicians",
      unlocks:
        "Determines whether the answer is documentation support, inbox routing, or protocol-based staff handling. These differ by an order of magnitude in cost.",
    });

  plan.push({
    week: "Week 3",
    action:
      "Rebuild the overhead figure in this report from your actual P&L, adding rent, supplies, malpractice, and benefits.",
    owner: "Practice manager / CPA",
    unlocks:
      "Validates or corrects the economic base of this entire audit against real financials.",
  });

  plan.push({
    week: "Week 4",
    action:
      "Review the collected measurements and commit to exactly one change. Define the metric that will show whether it worked, and the date you will check it.",
    owner: "Owner / physician leader",
    unlocks:
      "Converts a diagnostic into a decision. Practices that skip this step run the same audit again in a year.",
  });

  return plan;
}

function executiveSummary(
  a: AuditAnswers,
  d: ReturnType<typeof derive>,
  score: ReturnType<typeof computeScore>,
  top: Finding[],
  opp: { low: number; high: number; count: number },
): string[] {
  const lines: string[] = [];

  const qty = (v: number) => num(v, v % 1 === 0 ? 0 : 1);
  const isSolo = a.physicians === 1;
  const size =
    a.physicians === null
      ? "This"
      : isSolo
        ? "A solo dermatology practice"
        : `A ${qty(a.physicians)}-physician practice`;
  const withApps =
    a.apps !== null && a.apps > 0
      ? ` with ${qty(a.apps)} PA/NP${a.apps === 1 ? "" : "s"}`
      : "";

  if (a.annualCollections !== null) {
    const perPhysician =
      !isSolo && d.collectionsPerPhysician !== null
        ? ` — ${currencyExact(d.collectionsPerPhysician)} per physician`
        : "";
    const perHour =
      d.collectionsPerProviderHour !== null
        ? `${perPhysician ? ", or" : " —"} ${currencyExact(
            d.collectionsPerProviderHour,
          )} for every scheduled provider hour`
        : "";
    lines.push(
      `${size}${withApps}, collecting ${currencyExact(
        a.annualCollections,
      )} a year${perPhysician}${perHour}.`,
    );
  }

  if (score.overall !== null) {
    lines.push(
      `Practice Leverage Score: ${score.overall} of 100 — ${score.band.toLowerCase()}. ${score.bandDescription}${
        score.coverage < 0.99
          ? ` Scored across ${score.scoredCount} of ${score.totalCount} dimensions; the rest were skipped.`
          : ""
      }`,
    );
  } else if (score.scoredCount > 0) {
    lines.push(
      `We are not publishing an overall Practice Leverage Score for this audit. ${score.bandDescription}`,
    );
  }

  if (top[0]) {
    const second = top[1];
    lines.push(
      `The clearest signal is ${top[0].title.toLowerCase()}. ${top[0].headline}${
        second ? ` Behind it: ${second.title.toLowerCase()}.` : ""
      }`,
    );
  }

  if (opp.high > 0) {
    lines.push(
      `Across the ${opp.count} finding${opp.count === 1 ? "" : "s"} we could put numbers on, the identified recurring range is ${currencyExact(
        opp.low,
      )} to ${currencyExact(
        opp.high,
      )} a year. These are directional estimates built from your own inputs and the assumptions listed at the end of this report — not audited figures, and not a promise. They also overlap: several of them draw on the same underlying hours and slots, so the total is an order of magnitude, not a sum you should bank.`,
    );
  } else {
    lines.push(
      "We did not find enough quantifiable leakage to put a range on. That is a genuine result, not a failure of the tool — the questions at the end of this report are where the remaining uncertainty sits.",
    );
  }

  if (d.contributionPerProviderHour !== null && a.physicianAdminHoursPerWeek !== null) {
    lines.push(
      `One number worth carrying out of this: an hour of provider time is worth about ${currencyExact(
        d.contributionPerProviderHour,
      )} in contribution here, and roughly ${rawPercent(
        (d.physicianAdminShareOfWorkWeek ?? 0) * 100,
      )} of the physician work week is currently spent outside of it.`,
    );
  }

  return lines;
}

export { DEFAULT_ASSUMPTIONS };
