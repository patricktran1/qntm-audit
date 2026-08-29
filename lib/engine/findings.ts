import { currencyExact, num, rawPercent } from "../format";
import type { Derived } from "./derive";
import type {
  Assumptions,
  AuditAnswers,
  Confidence,
  EvidenceLine,
  Finding,
  Level,
} from "./types";

/**
 * OPPORTUNITY ENGINE
 *
 * Each detector answers one question: "given what this practice told us, is
 * there a specific, defensible thing worth looking at?" A detector returns null
 * when the answer is no, or when we lack the inputs to say anything honest.
 *
 * Rules every detector follows:
 *  - Evidence lines quote the user's own numbers back to them.
 *  - Estimates are ranges, never point values, and always carry their formula.
 *  - Confidence drops when the estimate leans on a behavioral assumption.
 *  - The next step is something the practice can do without buying anything.
 */

type Draft = Omit<Finding, "bucket" | "rank">;
type Detector = (ctx: Ctx) => Draft | null;

interface Ctx {
  a: AuditAnswers;
  k: Assumptions;
  d: Derived;
}

const reported = (label: string, value: string): EvidenceLine => ({
  label,
  value,
  reported: true,
});
const derivedLine = (label: string, value: string): EvidenceLine => ({
  label,
  value,
  reported: false,
});

/**
 * Impact is judged relative to the practice's own collections, not against a
 * fixed dollar threshold. $60k means something very different to a solo
 * practice than to an eight-physician group, and a scale-blind threshold is
 * how these reports end up telling every small practice that nothing matters.
 */
function impactFromDollars(
  dollarsHigh: number | null,
  collections: number | null,
): Level {
  if (dollarsHigh === null || dollarsHigh <= 0) return "low";
  if (collections === null || collections <= 0) {
    return dollarsHigh > 150_000 ? "high" : dollarsHigh > 50_000 ? "medium" : "low";
  }
  const share = dollarsHigh / collections;
  if (share >= 0.03) return "high";
  if (share >= 0.01) return "medium";
  return "low";
}

const RANK: Record<Level, number> = { low: 0, medium: 1, high: 2 };
/** Raise an impact to at least `floor` when an operational signal is severe. */
const atLeast = (impact: Level, floor: Level): Level =>
  RANK[impact] >= RANK[floor] ? impact : floor;

// ── Detectors ───────────────────────────────────────────────────────────────

const phoneCapacity: Detector = ({ a, k, d }) => {
  if (a.callsPerDay === null || a.callsPerDay <= 0) return null;
  const unanswered = a.unansweredCallPercent;
  const heavyLoad =
    d.callsPerFrontOfficeFtePerDay !== null && d.callsPerFrontOfficeFtePerDay >= 45;
  const missing = unanswered !== null && unanswered >= 8;
  if (!heavyLoad && !missing) return null;

  const evidence: EvidenceLine[] = [
    reported("Inbound calls per clinic day", num(a.callsPerDay)),
  ];
  if (unanswered !== null)
    evidence.push(reported("Unanswered / abandoned", rawPercent(unanswered)));
  if (a.frontOfficeFte !== null)
    evidence.push(reported("Front-office FTE", num(a.frontOfficeFte, 1)));
  if (d.callsPerFrontOfficeFtePerDay !== null)
    evidence.push(
      derivedLine(
        "Calls per front-office FTE per day",
        num(d.callsPerFrontOfficeFtePerDay),
      ),
    );
  if (d.callShareOfFrontOfficeCapacity !== null)
    evidence.push(
      derivedLine(
        "Share of front-office capacity on phones",
        rawPercent(d.callShareOfFrontOfficeCapacity * 100),
      ),
    );

  // Two different dollar figures, kept separate on purpose:
  //   (1) staff capacity currently tied up in phone work — a cost you already pay
  //   (2) new patients plausibly lost to unanswered calls — speculative, ranged
  const capacityCost =
    d.callHoursPerDay !== null && d.clinicalDaysPerYear !== null
      ? d.callHoursPerDay * d.clinicalDaysPerYear * k.frontOfficeLoadedHourlyCost
      : null;

  let lostLow = 0;
  let lostHigh = 0;
  const assumptions: string[] = [];
  if (
    unanswered !== null &&
    d.collectionsPerVisit !== null &&
    d.clinicalDaysPerYear !== null
  ) {
    const missedPerYear = a.callsPerDay * (unanswered / 100) * d.clinicalDaysPerYear;
    const neverReturn = missedPerYear * (1 - k.callbackRate);
    const newPatientAttempts = neverReturn * k.newPatientCallShare;
    const valuePerNewPatient =
      d.collectionsPerVisit * k.visitsPerNewPatientYearOne * k.contributionMargin;
    // Low end halves the new-patient share to acknowledge how soft it is.
    lostLow = newPatientAttempts * 0.5 * valuePerNewPatient;
    lostHigh = newPatientAttempts * valuePerNewPatient;
    assumptions.push(
      `${rawPercent((1 - k.callbackRate) * 100)} of unanswered callers never try again`,
      `${rawPercent(k.newPatientCallShare * 100)} of inbound calls are new-patient requests (low end halves this)`,
      `A first-year new patient generates ${num(k.visitsPerNewPatientYearOne, 1)} visits at ${currencyExact(d.collectionsPerVisit)} each`,
      `Contribution margin ${rawPercent(k.contributionMargin * 100)}`,
    );
  }

  // Dollar impact, floored by operational severity: when one call in five never
  // reaches a person, that is a material finding whatever the modelled revenue
  // number says.
  const dollarImpact = impactFromDollars(
    Math.max(lostHigh, capacityCost ?? 0),
    a.annualCollections,
  );
  const impact: Level =
    unanswered !== null && unanswered >= 20
      ? atLeast(dollarImpact, "high")
      : unanswered !== null && unanswered >= 12
        ? atLeast(dollarImpact, "medium")
        : dollarImpact;

  return {
    id: "phone-capacity",
    category: "FRONT OFFICE",
    title: "Phone volume is consuming front-office capacity",
    headline:
      unanswered !== null && unanswered >= 8
        ? `About ${rawPercent(unanswered)} of inbound calls never reach a person, and the calls that do are absorbing a large share of front-desk time.`
        : `Your front desk is fielding roughly ${num(d.callsPerFrontOfficeFtePerDay)} calls per person per day on top of check-in, check-out, and records.`,
    evidence,
    interpretation:
      "Phone work is the least differentiated labor in the practice and the easiest to displace, but it competes directly with the patients standing at the desk. When call volume per person climbs, both the phone queue and the front-desk experience degrade at the same time — and neither shows up in a P&L line you can point at.",
    estimate:
      lostHigh > 0
        ? {
            low: lostLow,
            high: lostHigh,
            formula:
              "unanswered calls/year × share who never call back × share that are new-patient requests × first-year contribution per new patient",
            assumptions,
            kind: "recoverable",
            recurrence: "annual",
          }
        : capacityCost !== null
          ? {
              low: capacityCost * 0.8,
              high: capacityCost,
              formula:
                "phone hours per day × clinic days per year × front-office loaded hourly cost",
              assumptions: [
                `${num(k.callHandleMinutes, 1)} staff minutes per handled call`,
                `${currencyExact(k.frontOfficeLoadedHourlyCost)}/hr loaded front-office cost`,
              ],
              kind: "current_cost",
              recurrence: "annual",
            }
          : null,
    impact,
    effort: "low",
    confidence: unanswered !== null ? "medium" : "low",
    automation: "phone_triage",
    nextStep:
      "Before changing anything, tag call reasons for five consecutive clinic days — scheduling, results, refills, billing, clinical question, other. Practices routinely find that 50–70% of volume falls into two categories, and that changes what you should build.",
  };
};

const noShowLeakage: Detector = ({ a, k, d }) => {
  if (a.noShowRate === null || a.noShowRate < 5) return null;
  if (d.noShowRecoverableValue === null || d.noShowVisitsPerYear === null) return null;

  return {
    id: "no-show-leakage",
    category: "PATIENT ACCESS",
    title: "Missed appointments are removing bookable capacity",
    headline: `A ${rawPercent(a.noShowRate)} no-show and same-day cancellation rate is taking roughly ${num(d.noShowVisitsPerYear)} slots off your schedule each year.`,
    evidence: [
      reported("No-show + same-day cancellation rate", rawPercent(a.noShowRate)),
      derivedLine("Estimated missed slots per year", num(d.noShowVisitsPerYear)),
      derivedLine("Collections per visit", currencyExact(d.collectionsPerVisit)),
      ...(a.thirdNextAvailableDays !== null
        ? [reported("Third-next-available", `${num(a.thirdNextAvailableDays)} days`)]
        : []),
    ],
    interpretation:
      a.thirdNextAvailableDays !== null && a.thirdNextAvailableDays > 14
        ? "This is the combination worth paying attention to: patients are waiting weeks for an appointment while slots go empty on the day. The demand exists — it is the matching that is failing. That is a workflow problem, not a marketing problem."
        : "Missed slots are only worth money if there is demand to backfill them. The recapture assumption below controls that. If your schedule is not full, set it to zero and this finding correctly collapses.",
    estimate: {
      low: d.noShowRecoverableValue * 0.6,
      high: d.noShowRecoverableValue,
      formula:
        "missed slots per year × collections per visit × contribution margin × refillable share",
      assumptions: [
        `${rawPercent(k.noShowRecaptureRate * 100)} of missed slots are realistically refillable`,
        `Contribution margin ${rawPercent(k.contributionMargin * 100)}`,
        "Low end applies a further 40% haircut for imperfect execution",
      ],
      kind: "recoverable",
      recurrence: "annual",
    },
    impact: impactFromDollars(d.noShowRecoverableValue, a.annualCollections),
    effort: "low",
    confidence: "medium",
    automation: "reminders_recalls",
    nextStep:
      "Split your no-show number by visit type and by lead time. In most practices the rate is concentrated in appointments booked more than three weeks out — which tells you whether to fix reminders or fix the schedule.",
  };
};

const physicianAdminLoad: Detector = ({ a, k, d }) => {
  if (a.physicianAdminHoursPerWeek === null || a.physicianAdminHoursPerWeek < 3)
    return null;
  if (d.physicianAdminOpportunityCost === null) return null;

  const sharePct =
    d.physicianAdminShareOfWorkWeek !== null
      ? d.physicianAdminShareOfWorkWeek * 100
      : null;

  return {
    id: "physician-admin-load",
    category: "PHYSICIAN TIME",
    title: "Physician hours are going to work that does not require a physician",
    headline: `${num(a.physicianAdminHoursPerWeek, 1)} administrative hours per physician per week${
      sharePct !== null ? ` — ${rawPercent(sharePct)} of the physician work week` : ""
    }, priced at ${currencyExact(d.contributionPerProviderHour)} per hour using your own economics.`,
    evidence: [
      reported("Physician admin hours per week", `${num(a.physicianAdminHoursPerWeek, 1)} hrs`),
      derivedLine(
        "Scheduled clinical hours per week",
        `${num((a.clinicalDaysPerWeek ?? 0) * k.hoursPerClinicalDay, 1)} hrs`,
      ),
      derivedLine(
        "Collections per provider clinical hour",
        currencyExact(d.collectionsPerProviderHour),
      ),
      derivedLine(
        "Contribution value of one provider hour",
        currencyExact(d.contributionPerProviderHour),
      ),
      derivedLine(
        "Practice-wide physician admin hours per year",
        `${num(d.practiceAdminHoursPerYear)} hrs`,
      ),
    ],
    interpretation:
      "We are not claiming this is cash you could bank tomorrow. Half of this time typically cannot be converted to clinic even if it were freed. What the number does establish is the exchange rate: every hour of documentation, inbox, refill, or form work is being purchased at the contribution value of a clinical hour, and that is the price to weigh any fix against.",
    estimate: {
      // Deliberately conservative: only a third to a half of freed physician
      // time realistically converts to clinical or genuinely reclaimed time.
      low: d.physicianAdminOpportunityCost * 0.25,
      high: d.physicianAdminOpportunityCost * 0.5,
      formula:
        "physician admin hours/year × contribution per provider hour × share convertible to clinical time (25–50%)",
      assumptions: [
        `Contribution margin ${rawPercent(k.contributionMargin * 100)}`,
        `${num(k.clinicalWeeksPerYear)} clinic weeks per year`,
        "Only 25–50% of freed physician time is assumed to convert to clinical or genuinely recovered personal time",
        `Gross value of all admin time before that haircut: ${currencyExact(d.physicianAdminOpportunityCost)}`,
      ],
      kind: "freed_capacity",
      recurrence: "annual",
    },
    impact: atLeast(
      impactFromDollars(d.physicianAdminOpportunityCost * 0.5, a.annualCollections),
      sharePct !== null && sharePct >= 25 ? "high" : "low",
    ),
    effort: "medium",
    confidence: "medium",
    automation: "documentation",
    nextStep:
      "For one week, have each physician log admin time in four buckets: notes, inbox/results, refills, and forms/prior auth. The bucket that dominates determines whether the answer is scribing, inbox routing, protocol-based staff handling, or a payer-side fix. These have completely different costs.",
  };
};

const priorAuthLoad: Detector = ({ a, k, d }) => {
  if (a.priorAuthStaffHoursPerWeek === null || a.priorAuthStaffHoursPerWeek < 5)
    return null;
  if (d.priorAuthLaborCost === null) return null;

  const fteEquivalent = (a.priorAuthStaffHoursPerWeek * 52) / k.workingHoursPerFteYear;

  return {
    id: "prior-auth-load",
    category: "OVERHEAD",
    title: "Prior authorization is consuming a measurable share of clinical staff",
    headline: `${num(a.priorAuthStaffHoursPerWeek)} staff hours a week on prior authorization is the equivalent of ${num(fteEquivalent, 2)} full-time positions doing nothing but payer paperwork.`,
    evidence: [
      reported("Staff hours per week on prior auth", `${num(a.priorAuthStaffHoursPerWeek)} hrs`),
      derivedLine("Full-time-equivalent positions", num(fteEquivalent, 2)),
      derivedLine("Annual labor cost", currencyExact(d.priorAuthLaborCost)),
      ...(a.physicianAdminHoursPerWeek !== null
        ? [
            derivedLine(
              "Physician hours also touching admin work",
              `${num(a.physicianAdminHoursPerWeek, 1)} hrs/wk`,
            ),
          ]
        : []),
    ],
    interpretation:
      "Prior auth is unusual: the work is high-volume, rule-driven, and largely identical week to week, which is exactly the profile that structured automation handles well — but it is also payer-dependent and fails loudly when it fails. The realistic near-term target is reducing touch time per authorization and eliminating rework, not eliminating the function.",
    estimate: {
      low: d.priorAuthLaborCost * 0.2,
      high: d.priorAuthLaborCost * 0.4,
      formula:
        "annual prior-auth labor cost × 20–40% reduction in touch time from templating, payer-rule libraries, and status automation",
      assumptions: [
        `${currencyExact(k.clinicalStaffLoadedHourlyCost)}/hr loaded clinical staff cost`,
        "20–40% touch-time reduction, not elimination of the function",
        `Full annual cost before reduction: ${currencyExact(d.priorAuthLaborCost)}`,
      ],
      kind: "freed_capacity",
      recurrence: "annual",
    },
    impact: impactFromDollars(d.priorAuthLaborCost * 0.4, a.annualCollections),
    effort: "medium",
    confidence: "medium",
    automation: "prior_auth",
    nextStep:
      "Count authorizations by payer and by drug or procedure for two weeks, and record how many required a second or third submission. Concentration is the whole story here — if three payers and two drug classes cover most of the volume, this is tractable.",
  };
};

const arAging: Detector = ({ a, d }) => {
  if (a.daysInAR === null || a.daysInAR <= 40) return null;
  if (a.annualCollections === null) return null;

  // Cash tied up in the excess A/R days above a 35-day operating target.
  const dailyRevenue = a.annualCollections / 365;
  const excessDays = a.daysInAR - 35;
  const trappedCash = dailyRevenue * excessDays;

  return {
    id: "ar-aging",
    category: "REVENUE OPERATIONS",
    title: "Cash is sitting in accounts receivable longer than it needs to",
    headline: `At ${num(a.daysInAR)} days in A/R, roughly ${currencyExact(trappedCash)} of collected-but-not-received revenue is permanently in transit.`,
    evidence: [
      reported("Days in A/R", `${num(a.daysInAR)} days`),
      derivedLine("Revenue per calendar day", currencyExact(dailyRevenue)),
      derivedLine("Days above a 35-day working target", num(excessDays)),
      derivedLine("Working capital held in that gap", currencyExact(trappedCash)),
    ],
    interpretation:
      "Long A/R is rarely one problem. It is usually some mix of front-end eligibility errors, coding rework, and denial follow-up that nobody owns. The distinction matters because the first is fixable at check-in, the second in the chart, and the third only with dedicated follow-up capacity. This is a one-time cash release, not recurring revenue — we count it separately for that reason.",
    estimate: {
      low: trappedCash * 0.3,
      high: trappedCash * 0.6,
      formula:
        "(days in A/R − 35) × daily revenue × share recoverable by tightening front-end and denial follow-up (30–60%)",
      assumptions: [
        "35 days used as a working operating target, not an industry benchmark",
        "One-time working capital release, not recurring annual revenue",
        "Assumes no change in payer mix",
      ],
      kind: "recoverable",
      recurrence: "one_time",
    },
    impact: impactFromDollars(trappedCash * 0.6, a.annualCollections),
    effort: "medium",
    confidence: "medium",
    automation: "billing_followup",
    nextStep:
      "Pull an A/R aging by payer and by denial reason code. If more than a quarter of the balance sits past 90 days, the issue is follow-up capacity. If denials cluster in a few reason codes, the issue is upstream and cheaper to fix.",
  };
};

const billingCostPressure: Detector = ({ a, d }) => {
  if (a.annualCollections === null || d.billingCost === null) return null;
  const share = (d.billingCost / a.annualCollections) * 100;
  if (share < 5.5) return null;

  const isOutsourced = a.billingModel === "outsourced" || a.billingModel === "hybrid";

  return {
    id: "billing-cost",
    category: "REVENUE OPERATIONS",
    title: "Billing is costing more than the revenue it protects may justify",
    headline: `Billing and revenue-cycle work is consuming ${rawPercent(share, 1)} of collections — ${currencyExact(d.billingCost)} a year.`,
    evidence: [
      reported(
        "Billing model",
        a.billingModel === "outsourced"
          ? "Outsourced"
          : a.billingModel === "in_house"
            ? "In-house"
            : "Hybrid",
      ),
      ...(a.billingPercent !== null
        ? [reported("Vendor fee", `${rawPercent(a.billingPercent, 1)} of collections`)]
        : []),
      ...(a.billingFte !== null
        ? [reported("In-house billing FTE", num(a.billingFte, 1))]
        : []),
      derivedLine("Annual billing cost", currencyExact(d.billingCost)),
      derivedLine("As a share of collections", rawPercent(share, 1)),
      ...(a.daysInAR !== null
        ? [reported("Days in A/R", `${num(a.daysInAR)} days`)]
        : []),
    ],
    interpretation:
      isOutsourced
        ? "A percentage-of-collections arrangement only makes sense if the vendor is measurably outperforming what the same money would buy internally. The test is not the rate — it is the rate against clean-claim rate, denial rate, and days in A/R. If those are unremarkable, you are paying a variable price for a fixed-cost function."
        : "In-house billing at this cost level should be producing visibly strong A/R performance. If it is not, the constraint is usually tooling and workflow rather than headcount — adding people to an unclear denial process reliably makes it more expensive without making it faster.",
    estimate: {
      low: a.annualCollections * 0.005,
      high: a.annualCollections * 0.015,
      formula:
        "annual collections × 0.5–1.5 percentage points of achievable billing-cost reduction",
      assumptions: [
        "Assumes a renegotiation or model change is available at equal performance",
        "Contingent on A/R and denial performance holding constant",
        "Expressed as points of collections, not as a guaranteed vendor discount",
      ],
      kind: "recoverable",
      recurrence: "annual",
    },
    impact: impactFromDollars(a.annualCollections * 0.015, a.annualCollections),
    effort: isOutsourced ? "low" : "high",
    // The *cost* is known precisely. The *savings* are not — they assume a
    // renegotiation is available at equal performance, which is exactly the
    // kind of claim that should not carry high confidence.
    confidence: share > 8 ? "medium" : "low",
    automation: "billing_followup",
    nextStep:
      "Ask your biller — internal or external — for clean-claim rate, first-pass denial rate, and days in A/R by payer, for the last two quarters. A vendor who cannot produce these on request has answered the question.",
  };
};

const accessDelay: Detector = ({ a, d }) => {
  if (a.thirdNextAvailableDays === null || a.thirdNextAvailableDays < 15) return null;

  return {
    id: "access-delay",
    category: "PATIENT ACCESS",
    title: "New-patient wait time is long enough to be losing referrals",
    headline: `A ${num(a.thirdNextAvailableDays)}-day wait for the third-next-available new patient appointment is a demand signal that is currently being spent rather than captured.`,
    evidence: [
      reported("Third-next-available (new patient)", `${num(a.thirdNextAvailableDays)} days`),
      ...(a.noShowRate !== null
        ? [reported("No-show + same-day cancellation rate", rawPercent(a.noShowRate))]
        : []),
      ...(a.unansweredCallPercent !== null
        ? [reported("Calls unanswered", rawPercent(a.unansweredCallPercent))]
        : []),
      ...(d.annualVisits !== null
        ? [derivedLine("Estimated annual visits", num(d.annualVisits))]
        : []),
    ],
    interpretation:
      a.noShowRate !== null && a.noShowRate >= 8
        ? "A long wait alongside a meaningful no-show rate is the classic access paradox: the schedule looks full but does not run full. Adding provider capacity here is the expensive answer to the wrong question — the cheaper one is recovering the slots you already own."
        : "Long waits push referring physicians and self-referred patients toward whoever can see them sooner. The value of this finding is not in the wait itself but in what it says about how the schedule is constructed — template, visit-type mix, and how far out booking is allowed to run.",
    estimate: null,
    impact: a.thirdNextAvailableDays > 30 ? "high" : "medium",
    effort: "medium",
    confidence: "medium",
    automation: "scheduling",
    nextStep:
      "Measure third-next-available separately for new patients, established patients, and cosmetic or procedural visits. A single blended number hides which door is actually blocked.",
  };
};

const overheadLoad: Detector = ({ a, d }) => {
  if (d.overheadShare === null || d.overheadShare < 0.3) return null;
  if (a.annualCollections === null) return null;

  return {
    id: "overhead-load",
    category: "OVERHEAD",
    title: "Identified overhead is a large share of collections before fixed costs",
    headline: `Staff, billing, and software alone consume ${rawPercent(d.overheadShare * 100)} of collections — before rent, supplies, malpractice, or physician compensation.`,
    evidence: [
      reported("Annual collections", currencyExact(a.annualCollections)),
      reported(
        "Staff (front office + clinical)",
        `${num(a.frontOfficeFte, 1)} + ${num(a.clinicalStaffFte, 1)} FTE`,
      ),
      derivedLine("Front-office labor", currencyExact(d.frontOfficeCost)),
      derivedLine("Clinical support labor", currencyExact(d.clinicalStaffCost)),
      derivedLine("Billing / RCM", currencyExact(d.billingCost)),
      derivedLine("Software", currencyExact(d.softwareCost)),
      derivedLine("Total identified", currencyExact(d.identifiedOverhead)),
      derivedLine("Share of collections", rawPercent(d.overheadShare * 100)),
      ...(d.supportStaffPerProvider !== null
        ? [derivedLine("Support staff per provider", num(d.supportStaffPerProvider, 2))]
        : []),
    ],
    interpretation:
      "Read this as a ratio question, not a cost-cutting one. High identified overhead against strong per-provider collections usually means the practice is under-scheduled relative to the team it employs — the fix is volume or provider mix, not layoffs. Against weak per-provider collections it means the revenue side needs attention first.",
    estimate: null,
    impact: d.overheadShare > 0.42 ? "high" : "medium",
    effort: "high",
    confidence: "medium",
    automation: null,
    nextStep:
      "Rebuild this ratio from your actual P&L and add the costs we deliberately excluded. If the complete figure lands where you expected, this is a structural conversation about provider mix and schedule density rather than an efficiency project.",
  };
};

const appLeverage: Detector = ({ a, d }) => {
  if (a.physicians === null || a.apps === null) return null;
  if (d.collectionsPerPhysician === null) return null;
  const ratio = a.apps / a.physicians;
  // Only fires when APP leverage is thin AND physician admin load is high —
  // the combination is what makes it actionable.
  if (ratio >= 0.5) return null;
  if (a.physicianAdminHoursPerWeek === null || a.physicianAdminHoursPerWeek < 6)
    return null;
  // Adding a provider only makes sense against unmet demand. Without a wait,
  // this finding would just be telling an under-booked practice to hire.
  const hasDemandSignal =
    (a.thirdNextAvailableDays !== null && a.thirdNextAvailableDays >= 14) ||
    (a.noShowRate !== null && a.noShowRate <= 6);
  if (!hasDemandSignal) return null;

  return {
    id: "app-leverage",
    category: "PHYSICIAN TIME",
    title: "Provider mix is concentrating work on physicians",
    headline: `At ${num(ratio, 2)} advanced practice providers per physician, alongside ${num(a.physicianAdminHoursPerWeek, 1)} physician admin hours a week, the practice is running on physician time as its default resource.`,
    evidence: [
      reported("Physicians (FTE)", num(a.physicians, 1)),
      reported("PAs / NPs (FTE)", num(a.apps, 1)),
      derivedLine("APP-to-physician ratio", num(ratio, 2)),
      reported("Physician admin hours per week", `${num(a.physicianAdminHoursPerWeek, 1)} hrs`),
      derivedLine("Collections per physician", currencyExact(d.collectionsPerPhysician)),
    ],
    interpretation:
      "This is the slowest of the findings here and the one most often mis-sequenced. Adding an advanced practice provider before the schedule, supervision model, and visit-type routing are defined tends to produce an expensive, under-booked provider. It belongs on the list as a structural option, not a near-term fix.",
    estimate: null,
    impact: "medium",
    effort: "high",
    confidence: "low",
    automation: null,
    nextStep:
      "Classify one month of physician visits by whether the visit type genuinely required a physician. That percentage — not a staffing ratio — tells you whether provider mix is actually your constraint.",
  };
};

const softwareStack: Detector = ({ a, d }) => {
  if (a.softwareSpendPerMonth === null || d.softwareCost === null) return null;
  if (a.annualCollections === null || a.annualCollections === 0) return null;
  // Measured against collections rather than per provider: software has large
  // fixed components, and a per-provider figure structurally penalises small
  // practices for being small.
  const shareOfCollections = d.softwareCost / a.annualCollections;
  if (shareOfCollections < 0.025) return null;

  return {
    id: "software-stack",
    category: "TECHNOLOGY",
    title: "Software spend per provider warrants an inventory",
    headline: `${currencyExact(d.softwareCost)} a year — ${rawPercent(shareOfCollections * 100, 1)} of collections — across a stack that likely accumulated one decision at a time.`,
    evidence: [
      reported("Monthly software spend", currencyExact(a.softwareSpendPerMonth)),
      derivedLine("Annual", currencyExact(d.softwareCost)),
      derivedLine("Share of collections", rawPercent(shareOfCollections * 100, 1)),
      ...(d.softwarePerProviderPerMonth !== null
        ? [derivedLine("Per provider per month", currencyExact(d.softwarePerProviderPerMonth))]
        : []),
    ],
    interpretation:
      "The number itself is not the finding — a stack that genuinely absorbs labor can justify almost any figure. The finding is that stacks at this level are usually additive rather than designed: each tool solved one problem, none of them retired a previous tool, and several overlap. The question is which tools removed work.",
    estimate: {
      low: d.softwareCost !== null ? d.softwareCost * 0.08 : 0,
      high: d.softwareCost !== null ? d.softwareCost * 0.18 : 0,
      formula: "annual software spend × 8–18% typically recoverable from overlap and unused seats",
      assumptions: [
        "Assumes an inventory finds overlapping or under-used tools, which is common but not universal",
        "Excludes any switching cost or migration effort",
      ],
      kind: "recoverable",
      recurrence: "annual",
    },
    impact: impactFromDollars(
      (d.softwareCost ?? 0) * 0.18,
      a.annualCollections,
    ),
    effort: "low",
    confidence: "low",
    automation: null,
    nextStep:
      "List every tool with its annual cost, seat count, and the last date anyone changed a setting in it. Tools nobody has configured in a year are either perfect or unused, and it is worth knowing which.",
  };
};

const frontOfficeRatio: Detector = ({ a, d }) => {
  if (d.frontOfficePerProvider === null || a.frontOfficeFte === null) return null;
  if (d.frontOfficePerProvider < 2.2) return null;
  if (a.callsPerDay !== null && (d.callsPerFrontOfficeFtePerDay ?? 0) > 55) return null;

  return {
    id: "front-office-ratio",
    category: "FRONT OFFICE",
    title: "Front-office headcount is high relative to provider count",
    headline: `${num(d.frontOfficePerProvider, 2)} front-office staff per provider, without a call volume that obviously explains it.`,
    evidence: [
      reported("Front-office FTE", num(a.frontOfficeFte, 1)),
      derivedLine("Providers", num(d.providers, 1)),
      derivedLine("Front-office per provider", num(d.frontOfficePerProvider, 2)),
      ...(d.callsPerFrontOfficeFtePerDay !== null
        ? [derivedLine("Calls per front-office FTE per day", num(d.callsPerFrontOfficeFtePerDay))]
        : []),
      derivedLine("Annual front-office cost", currencyExact(d.frontOfficeCost)),
    ],
    interpretation:
      "Elevated front-office headcount with unremarkable call volume usually means the work is manual rather than voluminous — paper intake, insurance verification by phone, records requests, or a scheduling process that requires a human at several steps. That is a workflow finding, not a headcount finding, and cutting staff without changing the workflow simply moves the queue.",
    estimate: null,
    impact: "medium",
    effort: "medium",
    confidence: "low",
    automation: "patient_intake",
    nextStep:
      "Shadow the front desk for two hours on a normal morning and write down every task that involves re-typing information the practice already has. That list is the actual scope of work here.",
  };
};

const visitYield: Detector = ({ a, d }) => {
  if (d.collectionsPerVisit === null || d.identifiedOverhead === null) return null;
  if (d.annualVisits === null || d.annualVisits === 0) return null;
  if (a.annualCollections === null) return null;

  const overheadPerVisit = d.identifiedOverhead / d.annualVisits;
  const ratio = overheadPerVisit / d.collectionsPerVisit;
  if (ratio < 0.35) return null;

  return {
    id: "visit-yield",
    category: "REVENUE OPERATIONS",
    title: "Each visit carries a heavy share of identified overhead",
    headline: `Every patient visit collects ${currencyExact(d.collectionsPerVisit)} and carries ${currencyExact(overheadPerVisit)} of identified overhead — ${rawPercent(ratio * 100)} of the visit — before rent, supplies, or physician pay.`,
    evidence: [
      reported("Annual collections", currencyExact(a.annualCollections)),
      reported(
        "Patients per provider per clinic day",
        num(a.patientsPerProviderPerDay),
      ),
      derivedLine("Collections per visit", currencyExact(d.collectionsPerVisit)),
      derivedLine("Identified overhead per visit", currencyExact(overheadPerVisit)),
      derivedLine("Overhead share of the visit", rawPercent(ratio * 100)),
      derivedLine("Estimated annual visits", num(d.annualVisits)),
    ],
    interpretation:
      "There are only three levers here and they are worth naming separately: what a visit collects (coding accuracy, visit-type mix, ancillary and pathology capture), how many visits the same team can support (schedule density and access), and what the team costs. Most practices reach for the third because it is the most visible, when the first is usually the largest and the least disruptive.",
    estimate: null,
    impact: ratio > 0.5 ? "high" : "medium",
    effort: "medium",
    confidence: "medium",
    automation: null,
    nextStep:
      "Compare collections per visit across your top five visit types. A wide spread points at coding or documentation; a narrow one at contracted rates, which is a different negotiation entirely.",
  };
};

const afterHoursSignal: Detector = ({ a, k, d }) => {
  // Fires only when physician admin load is severe enough that it is almost
  // certainly spilling outside clinic hours.
  if (a.physicianAdminHoursPerWeek === null) return null;
  if (d.physicianAdminShareOfWorkWeek === null) return null;
  if (d.physicianAdminShareOfWorkWeek < 0.25) return null;

  const weeklyHours =
    (a.clinicalDaysPerWeek ?? 0) * k.hoursPerClinicalDay + a.physicianAdminHoursPerWeek;

  return {
    id: "after-hours-load",
    category: "PHYSICIAN TIME",
    title: "The physician work week has expanded past what the schedule shows",
    headline: `Scheduled clinic plus reported admin comes to roughly ${num(weeklyHours, 1)} hours a week, with ${rawPercent(d.physicianAdminShareOfWorkWeek * 100)} of it non-clinical.`,
    evidence: [
      derivedLine("Total physician work week", `${num(weeklyHours, 1)} hrs`),
      reported("Of which administrative", `${num(a.physicianAdminHoursPerWeek, 1)} hrs`),
      derivedLine("Non-clinical share", rawPercent(d.physicianAdminShareOfWorkWeek * 100)),
    ],
    interpretation:
      "At this ratio the administrative work is no longer fitting inside the working day, which means it is being absorbed by evenings and weekends. That cost does not appear anywhere in the financials until it appears as a retention or succession problem, at which point it is expensive and slow to reverse.",
    estimate: null,
    impact: "high",
    effort: "medium",
    confidence: "medium",
    automation: "documentation",
    nextStep:
      "Ask each physician one question: how many hours did you spend in the chart after 7pm last week? Compare it to the number reported here. The gap between the two is usually where the real conversation starts.",
  };
};

export const DETECTORS: Detector[] = [
  phoneCapacity,
  noShowLeakage,
  physicianAdminLoad,
  priorAuthLoad,
  arAging,
  billingCostPressure,
  accessDelay,
  overheadLoad,
  visitYield,
  afterHoursSignal,
  frontOfficeRatio,
  appLeverage,
  softwareStack,
];

export function runDetectors(
  a: AuditAnswers,
  k: Assumptions,
  d: Derived,
): Draft[] {
  const ctx: Ctx = { a, k, d };
  const out: Draft[] = [];
  for (const detect of DETECTORS) {
    const found = detect(ctx);
    if (found) out.push(found);
  }
  return out;
}

export type { Draft, Confidence };
