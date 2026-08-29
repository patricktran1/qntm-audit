import { currencyExact, num } from "../format";
import type { Derived } from "./derive";
import type {
  Assumptions,
  AuditAnswers,
  AutomationCandidate,
  AutomationWorkflow,
  Finding,
} from "./types";

/**
 * AUTOMATION ANALYSIS
 *
 * We only surface a workflow when the practice's own answers point at it, and
 * we cap the list at three. A list of eleven "AI opportunities" is a brochure.
 */

const LABELS: Record<AutomationWorkflow, string> = {
  phone_triage: "Inbound phone triage and routing",
  scheduling: "Scheduling and rescheduling",
  reminders_recalls: "Reminders, confirmations, and recalls",
  prior_auth: "Prior authorization submission and status tracking",
  patient_intake: "Patient intake and insurance verification",
  documentation: "Clinical documentation support",
  billing_followup: "Claim follow-up and denial work",
  patient_faq: "Routine patient questions",
  referral_intake: "Inbound referral intake",
  review_requests: "Review and reputation requests",
};

export function automationCandidates(
  a: AuditAnswers,
  k: Assumptions,
  d: Derived,
  findings: Finding[],
): AutomationCandidate[] {
  const out: AutomationCandidate[] = [];
  const has = (id: string) => findings.some((f) => f.id === id);

  if (has("phone-capacity") && a.callsPerDay !== null) {
    const hours =
      d.callHoursPerDay !== null && d.clinicalDaysPerYear !== null
        ? d.callHoursPerDay * d.clinicalDaysPerYear
        : null;
    out.push({
      workflow: "phone_triage",
      label: LABELS.phone_triage,
      trigger: `${num(a.callsPerDay)} calls per clinic day${
        a.unansweredCallPercent !== null
          ? ` with ${num(a.unansweredCallPercent)}% never reaching a person`
          : ""
      }, against ${num(a.frontOfficeFte, 1)} front-office FTE.`,
      hoursPerYear: hours,
      annualLaborCost: hours === null ? null : hours * k.frontOfficeLoadedHourlyCost,
      confidence: a.unansweredCallPercent !== null ? "medium" : "low",
      readiness:
        "Highest-readiness workflow in this report. Scheduling, hours, directions, and refill-status calls are deterministic enough to route without clinical risk. Anything symptom-related must escalate to a person by design.",
    });
  }

  if (has("prior-auth-load") && a.priorAuthStaffHoursPerWeek !== null) {
    const hours = d.priorAuthHoursPerYear;
    out.push({
      workflow: "prior_auth",
      label: LABELS.prior_auth,
      trigger: `${num(a.priorAuthStaffHoursPerWeek)} staff hours a week on authorizations.`,
      hoursPerYear: hours,
      annualLaborCost: d.priorAuthLaborCost,
      confidence: "medium",
      readiness:
        "Partially automatable today. Form population, payer-rule lookup, and status polling are tractable; clinical justification and appeals are not. Expect touch-time reduction, not removal.",
    });
  }

  if (has("no-show-leakage") && a.noShowRate !== null) {
    out.push({
      workflow: "reminders_recalls",
      label: LABELS.reminders_recalls,
      trigger: `${num(a.noShowRate)}% no-show and same-day cancellation rate${
        a.thirdNextAvailableDays !== null
          ? ` against a ${num(a.thirdNextAvailableDays)}-day wait for new patients`
          : ""
      }.`,
      hoursPerYear: null,
      annualLaborCost: null,
      confidence: "medium",
      readiness:
        "Mature and low-risk, but only worth building if the waitlist side exists too. Reminders reduce no-shows; automated backfill is what converts the recovered slot into revenue.",
    });
  }

  if (has("physician-admin-load") || has("after-hours-load")) {
    out.push({
      workflow: "documentation",
      label: LABELS.documentation,
      trigger:
        a.physicianAdminHoursPerWeek !== null
          ? `${num(a.physicianAdminHoursPerWeek, 1)} physician admin hours per week, valued at ${currencyExact(
              d.contributionPerProviderHour,
            )} an hour by your own economics.`
          : "Reported physician administrative load.",
      hoursPerYear: d.practiceAdminHoursPerYear,
      annualLaborCost: d.physicianAdminOpportunityCost,
      confidence: "medium",
      readiness:
        "Depends entirely on which bucket dominates. Ambient documentation is well-established for note burden; inbox and results volume respond better to routing rules and protocol-based staff handling than to a scribe.",
    });
  }

  if (has("ar-aging") || has("billing-cost")) {
    out.push({
      workflow: "billing_followup",
      label: LABELS.billing_followup,
      trigger:
        a.daysInAR !== null
          ? `${num(a.daysInAR)} days in A/R.`
          : "Billing cost is a high share of collections.",
      hoursPerYear: null,
      annualLaborCost: d.billingCost,
      confidence: "low",
      readiness:
        "Status checking and denial triage automate well. The judgment work — appeals, payer negotiation, write-off decisions — does not, and vendors routinely overstate this one.",
    });
  }

  if (has("front-office-ratio")) {
    out.push({
      workflow: "patient_intake",
      label: LABELS.patient_intake,
      trigger: `${num(d.frontOfficePerProvider, 2)} front-office staff per provider without a call volume that explains it.`,
      hoursPerYear: null,
      annualLaborCost: d.frontOfficeCost,
      confidence: "low",
      readiness:
        "Digital intake and automated eligibility checks remove re-keying. Worth scoping only after you have watched where the manual time actually goes.",
    });
  }

  // Three is the honest maximum. More than that is a catalogue, not a finding.
  return out.slice(0, 3);
}

export { LABELS as AUTOMATION_LABELS };
