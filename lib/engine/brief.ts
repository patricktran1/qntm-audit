import { currencyExact, num, rawPercent } from "../format";
import { derive } from "./derive";
import type { AuditResult, Finding } from "./types";

/**
 * INTERNAL OPPORTUNITY BRIEF
 *
 * A sales-enablement artifact, not a physician-facing document. Its single
 * discipline: it must faithfully reflect what the practice actually said. If
 * this document overstates the opportunity, the first discovery call exposes it
 * and the relationship is over. It exists to make the call better, not to make
 * the lead look better.
 */

export type FitLevel = "strong" | "possible" | "weak";

export interface ServiceFit {
  service: string;
  fit: FitLevel;
  rationale: string;
}

export interface OpportunityBrief {
  practiceProfile: string;
  sizeBand: string;
  estimatedAnnualCollections: string;
  highestPain: string;
  painEvidence: string[];
  opportunityRange: string;
  opportunityCaveat: string;
  serviceFit: ServiceFit[];
  recommendedConversation: string;
  discoveryQuestions: string[];
  disqualifiers: string[];
  dataQuality: string;
}

function sizeBand(physicians: number | null, collections: number | null): string {
  if (physicians === null) return "Unknown size";
  const label =
    physicians <= 1
      ? "Solo"
      : physicians <= 3
        ? "Small group (2–3 physicians)"
        : physicians <= 8
          ? "Mid group (4–8 physicians)"
          : "Large group (9+ physicians)";
  return collections === null ? label : `${label} · ${currencyExact(collections)} collections`;
}

export function buildBrief(result: AuditResult): OpportunityBrief {
  const { answers: a, assumptions: k, findings, score } = result;
  const d = derive(a, k);
  const top: Finding | undefined = result.topOpportunities[0];

  const has = (id: string) => findings.some((f) => f.id === id);
  const fit = (cond: boolean, strong: boolean): FitLevel =>
    !cond ? "weak" : strong ? "strong" : "possible";

  const serviceFit: ServiceFit[] = [
    {
      service: "AI phone agent / inbound triage",
      fit: fit(
        has("phone-capacity"),
        (a.unansweredCallPercent ?? 0) >= 12 || (d.callsPerFrontOfficeFtePerDay ?? 0) >= 60,
      ),
      rationale: has("phone-capacity")
        ? `${num(a.callsPerDay)} calls/day, ${rawPercent(a.unansweredCallPercent ?? 0)} unanswered, ${num(a.frontOfficeFte, 1)} front-office FTE. ${
            (a.unansweredCallPercent ?? 0) >= 12
              ? "Answer-rate gap is large enough that the ROI case does not depend on soft assumptions."
              : "Volume is high but the answer rate is acceptable — lead with capacity relief, not lost revenue."
          }`
        : "No phone signal in their answers. Do not lead here.",
    },
    {
      service: "Virtual staffing / offshore front office",
      fit: fit(
        has("phone-capacity") || has("front-office-ratio") || has("prior-auth-load"),
        (d.frontOfficePerProvider ?? 0) >= 2.2 || (a.priorAuthStaffHoursPerWeek ?? 0) >= 20,
      ),
      rationale:
        (d.frontOfficePerProvider ?? 0) >= 2.2
          ? `${num(d.frontOfficePerProvider, 2)} front-office FTE per provider — headcount is the visible cost, but confirm the work is repetitive before proposing.`
          : has("prior-auth-load")
            ? `${num(a.priorAuthStaffHoursPerWeek)} hrs/week on prior auth is a clean, boundable scope for a dedicated resource.`
            : "No clear labor concentration to point at.",
    },
    {
      service: "Revenue cycle optimization",
      fit: fit(
        has("ar-aging") || has("billing-cost"),
        (a.daysInAR ?? 0) >= 55 ||
          (d.billingCost !== null &&
            a.annualCollections !== null &&
            d.billingCost / a.annualCollections >= 0.075),
      ),
      rationale: has("ar-aging")
        ? `${num(a.daysInAR)} days in A/R. Ask for aging past 90 and denial codes before quoting anything.`
        : has("billing-cost")
          ? `Billing at ${rawPercent(((d.billingCost ?? 0) / (a.annualCollections || 1)) * 100, 1)} of collections.`
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
        ? `Prior auth at ${num(a.priorAuthStaffHoursPerWeek)} hrs/week — concentrated, rule-driven, and measurable.`
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
        a.physicianAdminHoursPerWeek !== null
          ? `${num(a.physicianAdminHoursPerWeek, 1)} admin hrs/week/physician (${rawPercent(
              (d.physicianAdminShareOfWorkWeek ?? 0) * 100,
            )} of the work week). This is the emotional entry point even when it is not the largest dollar item — but the buyer is the physician, not the administrator.`
          : "Physician admin load was not reported.",
    },
    {
      service: "EHR / technology stack review",
      fit: fit(has("software-stack"), (d.softwarePerProviderPerMonth ?? 0) >= 2000),
      rationale:
        d.softwarePerProviderPerMonth !== null
          ? `${currencyExact(d.softwarePerProviderPerMonth)}/provider/month. Low-dollar engagement; useful as a door-opener, not as a lead offer.`
          : "Software spend not reported.",
    },
  ];

  const painEvidence = top
    ? top.evidence.slice(0, 4).map((e) => `${e.label}: ${e.value}`)
    : ["No dominant finding — the practice looks reasonably tight on the dimensions we measured."];

  const strongFits = serviceFit.filter((s) => s.fit === "strong");

  // Map the leading finding to the service that actually addresses it, so the
  // suggested opening and the suggested scope are about the same problem.
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
  const alignedName = top ? SCOPE_FOR_FINDING[top.id] : undefined;
  const aligned = alignedName
    ? serviceFit.find((s) => s.service === alignedName && s.fit !== "weak")
    : undefined;
  const firstScope = aligned ?? strongFits[0];

  const recommendedConversation = top
    ? `Open with their own number, not with QNTM. "${top.headline}" Then ask the next-step question from their report — ${top.nextStep.split(".")[0]?.toLowerCase()}. ${
        firstScope
          ? `If the conversation confirms it, ${firstScope.service.toLowerCase()} is the natural first scope.`
          : "There is no obvious first scope here; the honest play is to offer to help them measure, and revisit in a quarter."
      }`
    : "Nothing in this audit justifies a pitch. If they took the time to complete it, the useful move is to answer their questions and stay in touch — a manufactured problem costs more credibility than the deal is worth.";

  const disqualifiers: string[] = [];
  if (result.completeness < 0.6)
    disqualifiers.push(
      `Only ${rawPercent(result.completeness * 100)} of questions were answered — findings are thin. Treat estimates as conversation starters, not as claims.`,
    );
  if (score.overall !== null && score.overall >= 78)
    disqualifiers.push(
      "Score is high. This practice is running well; a pitch framed around inefficiency will land badly.",
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

  return {
    practiceProfile: `${num(a.physicians, 1)} physicians, ${num(a.apps, 1)} APPs, ${num(
      a.frontOfficeFte,
      1,
    )} front office, ${num(a.clinicalStaffFte, 1)} clinical support. ${num(
      a.clinicalDaysPerWeek,
      1,
    )} clinic days/week at ${num(a.patientsPerProviderPerDay)} patients per provider per day.`,
    sizeBand: sizeBand(a.physicians, a.annualCollections),
    estimatedAnnualCollections: currencyExact(a.annualCollections),
    highestPain: top ? top.title : "No dominant pain identified",
    painEvidence,
    opportunityRange:
      result.opportunityHigh > 0
        ? `${currencyExact(result.opportunityLow)} – ${currencyExact(result.opportunityHigh)} per year`
        : "Not quantifiable from the inputs given",
    opportunityCaveat:
      "Directional, built on the practice's own inputs plus the stated assumptions. Never quote this figure back to them as a savings guarantee — quote the finding, and let them own the number.",
    serviceFit: serviceFit.sort((x, y) => {
      const order: Record<FitLevel, number> = { strong: 0, possible: 1, weak: 2 };
      return order[x.fit] - order[y.fit];
    }),
    recommendedConversation,
    discoveryQuestions: [
      ...result.openQuestions.slice(0, 4).map((q) => q.question),
      "Who else needs to be in the room for a decision like this — a partner, an administrator, a spouse?",
      "What have you already tried here, and what specifically went wrong with it?",
    ],
    disqualifiers,
    dataQuality: `${rawPercent(result.completeness * 100)} of questions answered · ${
      score.scoredCount
    } of ${score.totalCount} score dimensions computed · ${
      findings.filter((f) => f.confidence === "high").length
    } high-confidence findings, ${findings.filter((f) => f.confidence === "low").length} low-confidence.`,
  };
}
