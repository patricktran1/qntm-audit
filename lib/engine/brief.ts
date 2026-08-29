import { currencyExact, num, rawPercent } from "../format";
import { derive } from "./derive";
import { EDITABLE_ASSUMPTIONS } from "./assumptions";
import type { AuditResult, Finding } from "./types";

/**
 * INTERNAL OPPORTUNITY BRIEF
 *
 * A pre-call intelligence artifact, not a restatement of the report. Its job is
 * to make the salesperson smarter than the physician expects: what is directly
 * observed versus inferred, which assumptions the whole economic case rests on,
 * what would invalidate the analysis, and what not to pitch.
 *
 * Its single discipline: it must faithfully reflect what the practice said. If
 * this document overstates the opportunity, the first discovery call exposes it
 * and the relationship is over.
 */

export type FitLevel = "strong" | "possible" | "weak";

export interface ServiceFit {
  service: string;
  fit: FitLevel;
  rationale: string;
}

export interface EvidenceItem {
  label: string;
  value: string;
  /** True when the practice stated it; false when the audit derived it. */
  observed: boolean;
}

export interface SensitivityItem {
  assumption: string;
  currentValue: string;
  effect: string;
}

export interface Objection {
  objection: string;
  response: string;
}

export interface OpportunityBrief {
  // Who and how big
  practiceProfile: string;
  sizeBand: string;
  estimatedAnnualCollections: string;
  // How much to trust it
  coverageSummary: string;
  dataQuality: string;
  confidenceCaution: string;
  // What hurts
  verdict: string;
  primaryPain: string;
  primaryPainEvidence: EvidenceItem[];
  secondaryPain: string | null;
  secondaryPainEvidence: EvidenceItem[];
  // The money
  recurringRange: string;
  oneTimeRange: string | null;
  opportunityCaveat: string;
  sensitivity: SensitivityItem[];
  // What to sell, and not
  serviceFit: ServiceFit[];
  doNotPitch: string[];
  // How to run the call
  openingQuestion: string;
  recommendedConversation: string;
  discoveryQuestions: string[];
  likelyObjections: Objection[];
  invalidators: string[];
  disqualifiers: string[];
  suggestedNextAction: string;
}

/** Maps a finding to the service that actually addresses it. */
const SCOPE_FOR_FINDING: Record<string, string> = {
  "phone-capacity": "AI phone agent / inbound triage",
  "front-office-ratio": "Virtual staffing / offshore front office",
  "prior-auth-load": "Workflow automation (prior auth, intake, recalls)",
  "no-show-leakage": "Workflow automation (prior auth, intake, recalls)",
  "access-delay": "Workflow automation (prior auth, intake, recalls)",
  "ar-aging": "Revenue cycle optimization",
  "billing-cost": "Revenue cycle optimization",
  "visit-yield": "Revenue cycle optimization",
  "physician-admin-load": "Documentation / physician time recovery",
  "after-hours-load": "Documentation / physician time recovery",
  "software-stack": "EHR / technology stack review",
  "overhead-load": "Virtual staffing / offshore front office",
};

/** A brief where everything is strong is a brochure. */
const MAX_STRONG_FITS = 3;

/** A stack review is a door-opener; leading with it trains bad habits. */
const NEVER_LEAD = new Set(["EHR / technology stack review"]);

/** Objections keyed to the finding that provokes them. */
const OBJECTIONS: Record<string, Objection> = {
  "phone-capacity": {
    objection: "“Our front desk handles the phones fine.”",
    response:
      "Do not argue. Ask what share of calls are abandoned and at what time of day — almost no practice knows, and the phone system does. The number either supports them or opens the conversation for you.",
  },
  "no-show-leakage": {
    objection: "“We already send reminders.”",
    response:
      "Reminders reduce no-shows; they do not refill the slot. Ask what happens to a slot that empties at 8am for an 11am appointment. If the answer is 'nothing', that is the actual finding.",
  },
  "physician-admin-load": {
    objection: "“That is just medicine now.”",
    response:
      "Largely true, and worth conceding immediately. The useful question is which bucket dominates — notes, inbox, refills, or prior auth — because three of the four have different answers and only one of them is scribing.",
  },
  "after-hours-load": {
    objection: "“I do not mind charting in the evening.”",
    response:
      "Do not push on burnout. Ask instead what happens to the practice when the physician doing this decides to cut a clinic day. The risk is a succession problem, not a wellness one.",
  },
  "ar-aging": {
    objection: "“Our biller says that is normal for our payer mix.”",
    response:
      "It might be. Ask for the aging split past 90 days and the top three denial codes. A biller who can produce those quickly usually has it under control; one who cannot has answered the question.",
  },
  "billing-cost": {
    objection: "“They have been with us for years and they are great.”",
    response:
      "Never attack the vendor. Ask for clean-claim rate, first-pass denial rate, and days in A/R by payer. You are testing performance, not loyalty.",
  },
  "prior-auth-load": {
    objection: "“Every derm practice deals with prior auth.”",
    response:
      "Agree, then ask for concentration: how many authorizations, by payer and by drug class, and how many needed a second submission. Concentration is what makes it tractable.",
  },
  "access-delay": {
    objection: "“A long wait means we are in demand.”",
    response:
      "Sometimes. Ask whether third-next-available is measured separately for new patients, and what their referral volume has done over 12 months. A wait plus flat referrals is leakage, not demand.",
  },
  "overhead-load": {
    objection: "“Your overhead number is wrong.”",
    response:
      "It probably is — the report says so. It excludes rent, supplies, malpractice, and physician comp. Ask them for the real figure. Being corrected here builds more credibility than being right.",
  },
};

function sizeBand(physicians: number | null): string {
  if (physicians === null) return "Unknown size";
  if (physicians <= 1) return "Solo";
  if (physicians <= 3) return "Small group (2–3 physicians)";
  if (physicians <= 8) return "Mid group (4–8 physicians)";
  return "Large group (9+ physicians)";
}

function evidenceFrom(finding: Finding | undefined): EvidenceItem[] {
  if (!finding) return [];
  return finding.evidence.slice(0, 5).map((e) => ({
    label: e.label,
    value: e.value,
    observed: e.reported,
  }));
}

export function buildBrief(result: AuditResult): OpportunityBrief {
  const { answers: a, assumptions: k, findings, score, verdict } = result;
  const d = derive(a, k);
  const top = result.topOpportunities[0];
  const second = result.topOpportunities[1];

  const has = (id: string) =>
    findings.some((f) => f.id === id && f.bucket !== "low_priority");
  const fit = (cond: boolean, strong: boolean): FitLevel =>
    !cond ? "weak" : strong ? "strong" : "possible";

  const billingShare =
    d.billingCost !== null && a.annualCollections
      ? d.billingCost / a.annualCollections
      : null;

  const serviceFit: ServiceFit[] = [
    {
      service: "AI phone agent / inbound triage",
      fit: fit(
        has("phone-capacity"),
        (a.unansweredCallPercent ?? 0) >= 12 ||
          (d.callsPerFrontOfficeFtePerDay ?? 0) >= 60,
      ),
      rationale: has("phone-capacity")
        ? `${num(a.callsPerDay)} calls/day, ${rawPercent(a.unansweredCallPercent ?? 0)} unanswered, ${num(a.frontOfficeFte, 1)} front-office FTE. ${
            (a.unansweredCallPercent ?? 0) >= 12
              ? "The answer-rate gap is large enough that the case does not depend on soft assumptions."
              : "Volume is high but the answer rate is acceptable — lead with capacity relief, not lost revenue."
          }`
        : "No phone signal in their answers. Do not lead here.",
    },
    {
      service: "Virtual staffing / offshore front office",
      fit: fit(
        has("phone-capacity") || has("front-office-ratio") || has("prior-auth-load"),
        (d.frontOfficePerProvider ?? 0) >= 2.2 ||
          (a.priorAuthStaffHoursPerWeek ?? 0) >= 20,
      ),
      rationale:
        (d.frontOfficePerProvider ?? 0) >= 2.2
          ? `${num(d.frontOfficePerProvider, 2)} front-office FTE per provider. Headcount is the visible cost; confirm the work is repetitive before proposing anything.`
          : has("prior-auth-load")
            ? `${num(a.priorAuthStaffHoursPerWeek)} hrs/week on prior auth is a clean, boundable scope for a dedicated resource.`
            : "No clear labour concentration to point at.",
    },
    {
      service: "Revenue cycle optimization",
      fit: fit(
        has("ar-aging") || has("billing-cost"),
        (a.daysInAR ?? 0) >= 55 || (billingShare ?? 0) >= 0.075,
      ),
      rationale: has("ar-aging")
        ? `${num(a.daysInAR)} days in A/R. Ask for aging past 90 and denial codes before quoting anything.`
        : has("billing-cost")
          ? `Billing at ${rawPercent((billingShare ?? 0) * 100, 1)} of collections.`
          : a.daysInAR === null
            ? "They could not report days in A/R — that itself is worth probing on the call."
            : "A/R and billing cost both look reasonable. Do not manufacture a problem here.",
    },
    {
      service: "Workflow automation (prior auth, intake, recalls)",
      fit: fit(
        has("prior-auth-load") || has("no-show-leakage") || has("front-office-ratio"),
        (a.priorAuthStaffHoursPerWeek ?? 0) >= 25 || (a.noShowRate ?? 0) >= 12,
      ),
      rationale: has("prior-auth-load")
        ? `Prior auth at ${num(a.priorAuthStaffHoursPerWeek)} hrs/week — concentrated, rule-driven, measurable.`
        : has("no-show-leakage")
          ? `${rawPercent(a.noShowRate ?? 0)} no-show rate with recoverable slot value.`
          : "No concentrated repetitive workflow surfaced.",
    },
    {
      service: "Documentation / physician time recovery",
      fit: fit(
        has("physician-admin-load") || has("after-hours-load"),
        (d.physicianAdminShareOfWorkWeek ?? 0) >= 0.25,
      ),
      rationale:
        a.physicianAdminHoursPerWeek !== null && has("physician-admin-load")
          ? `${num(a.physicianAdminHoursPerWeek, 1)} admin hrs/week/physician (${rawPercent(
              (d.physicianAdminShareOfWorkWeek ?? 0) * 100,
            )} of the work week). The emotional entry point even when it is not the largest dollar item — but the buyer is the physician, not the administrator.`
          : "Physician admin load is not a finding for this practice.",
    },
    {
      service: "EHR / technology stack review",
      fit: fit(has("software-stack"), false),
      rationale:
        d.softwarePerProviderPerMonth !== null
          ? `${currencyExact(d.softwarePerProviderPerMonth)}/provider/month. Low-dollar engagement; a door-opener, never a lead offer.`
          : "Software spend not reported.",
    },
  ];

  // Cap the strong ratings, keeping the one that matches the leading finding.
  const alignedName = top ? SCOPE_FOR_FINDING[top.id] : undefined;
  serviceFit
    .filter((s) => s.fit === "strong")
    .sort((x, y) => (x.service === alignedName ? -1 : y.service === alignedName ? 1 : 0))
    .forEach((s, i) => {
      if (NEVER_LEAD.has(s.service) || i >= MAX_STRONG_FITS) s.fit = "possible";
    });

  const aligned = alignedName
    ? serviceFit.find((s) => s.service === alignedName && s.fit !== "weak")
    : undefined;
  const firstScope = aligned ?? serviceFit.find((s) => s.fit === "strong");

  // ── What the economics actually rest on ───────────────────────────────────
  const sensitivity: SensitivityItem[] = [];
  const meta = (key: string) => EDITABLE_ASSUMPTIONS.find((m) => m.key === key);
  if (result.opportunityHigh > 0) {
    sensitivity.push({
      assumption: meta("contributionMargin")?.label ?? "Marginal contribution margin",
      currentValue: rawPercent(k.contributionMargin * 100),
      effect:
        "Scales every time-based figure in the report, including the value of a provider hour. Halve it and the physician-time findings roughly halve.",
    });
    if (findings.some((f) => f.id === "no-show-leakage"))
      sensitivity.push({
        assumption: "No-show slots realistically refillable",
        currentValue: rawPercent(k.noShowRecaptureRate * 100),
        effect:
          "Set to zero the no-show finding collapses entirely. If their schedule has no backfill demand, that estimate is worth nothing and you should say so first.",
      });
    if (findings.some((f) => f.id === "phone-capacity"))
      sensitivity.push({
        assumption: "Inbound calls that are new-patient requests",
        currentValue: rawPercent(k.newPatientCallShare * 100),
        effect:
          "The weakest assumption in the model, and the only support for the phone revenue estimate. One week of call-reason tagging replaces it. Do not defend this number — offer to replace it.",
      });
  }

  // ── What would prove us wrong ─────────────────────────────────────────────
  const invalidators: string[] = [];
  if (findings.some((f) => f.id === "no-show-leakage"))
    invalidators.push(
      "Their schedule is not actually full. If there is no waitlist and no backfill demand, recovered slots have no value and the no-show finding is void.",
    );
  if (findings.some((f) => f.id === "physician-admin-load"))
    invalidators.push(
      "The physician does not want more clinical time. If the admin hours are being traded for a shorter week by choice, the opportunity cost calculation does not describe a loss.",
    );
  if (findings.some((f) => f.id === "phone-capacity"))
    invalidators.push(
      "Their unanswered calls are mostly pharmacy, labs, and other practices rather than patients. Call-reason data settles this in a week.",
    );
  if (findings.some((f) => f.id === "ar-aging"))
    invalidators.push(
      "A payer mix skewed to slow-paying plans can explain elevated A/R without any process failure. Ask for aging by payer before treating it as a finding.",
    );
  if (a.patientsPerProviderPerDay !== null)
    invalidators.push(
      `Patients-per-day was reported as ${num(a.patientsPerProviderPerDay)}. Visit volume, collections per visit, and every per-visit figure derive from it, so if that number was a guess the economic base moves with it.`,
    );
  if (invalidators.length === 0)
    invalidators.push(
      "No specific invalidator identified — largely because the audit found little to invalidate.",
    );

  // ── Reasons to stand down ─────────────────────────────────────────────────
  const disqualifiers: string[] = [];
  if (verdict.level === "healthy")
    disqualifiers.push(
      "The audit concluded this practice is operationally healthy and told them so. Arriving with a pitch directly contradicts the report they just read.",
    );
  if (verdict.level === "insufficient_data")
    disqualifiers.push(
      "The audit withheld a verdict. There is nothing here to sell against yet; the only honest offer is help measuring.",
    );
  if (result.completeness < 0.6)
    disqualifiers.push(
      `Only ${rawPercent(result.completeness * 100)} of questions were answered — findings are thin. Treat estimates as conversation starters, not claims.`,
    );
  if (score.overall !== null && score.overall >= 78)
    disqualifiers.push(
      "Score is high. A pitch framed around inefficiency will land badly and be remembered.",
    );
  if ((a.physicians ?? 0) <= 1 && (a.annualCollections ?? 0) < 800_000)
    disqualifiers.push(
      "Small solo practice. Verify there is budget for a services engagement before investing discovery time.",
    );
  if (result.opportunityHigh < 40_000)
    disqualifiers.push(
      "Quantified opportunity is below the cost of most engagements. Do not force a proposal.",
    );
  if (disqualifiers.length === 0)
    disqualifiers.push("None identified from the audit inputs.");

  const standDown =
    verdict.level === "healthy" || verdict.level === "insufficient_data";

  const doNotPitch = serviceFit
    .filter((s) => s.fit === "weak")
    .map((s) => `${s.service} — ${s.rationale}`);
  if (standDown)
    doNotPitch.unshift(
      "Everything. This audit did not establish a problem worth solving, and the physician has read that conclusion in their own report.",
    );

  const openingQuestion = top
    ? `“${top.headline}” — does that match what you actually experience day to day?`
    : "“The audit did not find much. Does that match your own sense of the practice, or is there something it did not ask about?”";

  return {
    practiceProfile: `${num(a.physicians, 1)} physicians, ${num(a.apps, 1)} PA/NPs, ${num(
      a.frontOfficeFte,
      1,
    )} front office, ${num(a.clinicalStaffFte, 1)} clinical support. ${num(
      a.clinicalDaysPerWeek,
      1,
    )} clinic days/week at ${num(a.patientsPerProviderPerDay)} patients per provider per day.`,
    sizeBand: sizeBand(a.physicians),
    estimatedAnnualCollections: currencyExact(a.annualCollections),

    coverageSummary: `${score.scoredCount} of ${score.totalCount} score dimensions computed (${rawPercent(
      score.coverage * 100,
    )} of model weight). ${rawPercent(result.completeness * 100)} of questions answered.`,
    dataQuality: `${findings.filter((f) => f.confidence === "high").length} high-confidence findings, ${
      findings.filter((f) => f.confidence === "medium").length
    } medium, ${findings.filter((f) => f.confidence === "low").length} low.`,
    confidenceCaution:
      score.overall === null
        ? "No overall score was published. Do not quote one."
        : result.completeness < 0.8
          ? "Meaningful gaps in the inputs. Expect at least one finding to dissolve on contact with real data."
          : "Inputs are complete enough that the findings should survive a first conversation.",

    verdict: `${verdict.level.replace("_", " ")} — ${verdict.headline}`,
    primaryPain: top ? top.title : "No dominant pain identified",
    primaryPainEvidence: evidenceFrom(top),
    secondaryPain: second ? second.title : null,
    secondaryPainEvidence: evidenceFrom(second),

    recurringRange:
      result.opportunityHigh > 0
        ? `${currencyExact(result.opportunityLow)} – ${currencyExact(result.opportunityHigh)} per year`
        : "Not quantifiable from the inputs given",
    oneTimeRange:
      result.oneTimeHigh > 0
        ? `${currencyExact(result.oneTimeLow)} – ${currencyExact(result.oneTimeHigh)} one-time working capital, not recurring revenue`
        : null,
    opportunityCaveat:
      "Diagnostic opportunity estimates, not promised savings. Built from the practice's own inputs plus the stated assumptions, overlapping where findings draw on the same hours or slots. Quote the finding, never this figure — let them own the number.",
    sensitivity,

    serviceFit: serviceFit.sort((x, y) => {
      const order: Record<FitLevel, number> = { strong: 0, possible: 1, weak: 2 };
      return order[x.fit] - order[y.fit];
    }),
    doNotPitch: doNotPitch.length > 0 ? doNotPitch : ["Nothing flagged."],

    openingQuestion,
    recommendedConversation: standDown
      ? "Do not open with a problem. The report told this practice we do not think they need us; the only move that preserves credibility is to agree with it, answer whatever they ask, and offer to look again in six months. A practice that remembers us as the people who told them not to buy anything is a better lead next year than a forced proposal is today."
      : top
        ? `Open with their own number, not with QNTM. ${openingQuestion} Then ask the next-step question from their report — ${top.nextStep.split(".")[0]?.toLowerCase()}. ${
            firstScope
              ? `If the conversation confirms it, ${firstScope.service.toLowerCase()} is the natural first scope.`
              : "There is no obvious first scope; offer to help them measure and revisit in a quarter."
          }`
        : "Nothing in this audit justifies a pitch. Answer their questions and stay in touch.",
    discoveryQuestions: [
      ...result.openQuestions.slice(0, 4).map((q) => q.question),
      "Who else needs to be in the room for a decision like this — a partner, an administrator, a spouse?",
      "What have you already tried here, and what specifically went wrong with it?",
      "If this were fixed twelve months from now, what would be different that you would actually notice?",
    ],
    likelyObjections: result.topOpportunities
      .map((f) => OBJECTIONS[f.id])
      .filter((o): o is Objection => Boolean(o))
      .slice(0, 3),
    invalidators,
    disqualifiers,
    suggestedNextAction: standDown
      ? "Send the report link, add a six-month reminder, and do nothing else."
      : result.completeness < 0.6
        ? "Offer a short call about what to measure. Do not scope work from this data."
        : `Propose 30 minutes to review the findings${
            firstScope ? `, framed around ${firstScope.service.toLowerCase()}` : ""
          }. Ask for the aging report or call data before the call so it starts from evidence.`,
  };
}
