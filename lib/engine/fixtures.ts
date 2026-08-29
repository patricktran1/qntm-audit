import { EMPTY_ANSWERS } from "./questions";
import type { AuditAnswers, Category } from "./types";
import type { VerdictLevel } from "./verdict";

/**
 * GOLDEN PRACTICE FIXTURES
 *
 * A regression set, not a demo set. Each fixture is a synthetic practice in a
 * distinct operational state, paired with the *invariants* that must survive
 * any future model change.
 *
 * Invariants rather than snapshots, deliberately. Pinning exact dollar output
 * would make every legitimate improvement fail a test, and the team would
 * start updating expectations without reading them — which is worse than no
 * test. Pinning "this practice must remain healthy" or "the leading finding
 * must stay in this category" catches drift that actually changes meaning.
 *
 * No real practice data. Nothing here describes a patient.
 */

const A = (o: Partial<AuditAnswers>): AuditAnswers => ({ ...EMPTY_ANSWERS, ...o });

export interface FixtureInvariants {
  /** The verdict this practice must continue to receive. */
  verdict?: VerdictLevel;
  /** Verdict must be one of these, when a single value is too strict. */
  verdictIn?: VerdictLevel[];
  /** The leading finding's category. */
  leadingCategory?: Category;
  leadingCategoryIn?: Category[];
  /** Whether an overall score must be published. */
  scorePublished?: boolean;
  scoreAtLeast?: number;
  scoreAtMost?: number;
  minCoverage?: number;
  /** Whether the report should ask for a conversation. */
  ctaPosture?: "none" | "soft" | "standard";
  /** Whether any automation candidate may appear. */
  automationAllowed?: boolean;
  /** Recurring opportunity as a share of collections must stay under this. */
  maxRecurringShare?: number;
  /** One-time value may exceed recurring value for this practice. */
  oneTimeMayDominate?: boolean;
  /** Finding ids that must be present. */
  mustInclude?: string[];
  /** Finding ids that must not fire. */
  mustExclude?: string[];
  /** The leading finding must not come from this category. */
  leadingCategoryNot?: Category;
  /** This finding must be rated high impact when it fires. */
  findingMustBeHighImpact?: string;
  /** This finding must never be rated high impact. */
  findingMustNotBeHighImpact?: string;
}

export interface PracticeFixture {
  id: string;
  name: string;
  /** What operational state this fixture exists to represent. */
  represents: string;
  /** What would break if this fixture regressed. */
  protects: string;
  answers: AuditAnswers;
  invariants: FixtureInvariants;
}

export const PRACTICE_FIXTURES: PracticeFixture[] = [
  {
    id: "efficient-solo",
    name: "Efficient solo dermatologist",
    represents: "A genuinely well-run single-physician practice.",
    protects:
      "The healthy escape hatch. If this ever becomes `act`, the audit has turned into a sales tool.",
    answers: A({
      physicians: 1, apps: 1, annualCollections: 1_900_000, clinicalDaysPerWeek: 4,
      patientsPerProviderPerDay: 30, frontOfficeFte: 2, clinicalStaffFte: 3,
      billingModel: "outsourced", billingPercent: 4, noShowRate: 3,
      callsPerDay: 110, unansweredCallPercent: 4, thirdNextAvailableDays: 8,
      physicianAdminHoursPerWeek: 4, priorAuthStaffHoursPerWeek: 3,
      daysInAR: 26, softwareSpendPerMonth: 2_400,
    }),
    invariants: {
      verdict: "healthy",
      scorePublished: true,
      scoreAtLeast: 78,
      ctaPosture: "none",
      automationAllowed: false,
      maxRecurringShare: 0.02,
      mustExclude: ["physician-admin-load", "ar-aging"],
    },
  },
  {
    id: "access-constrained",
    name: "High-demand, access-constrained practice",
    represents:
      "Strong demand the schedule cannot absorb: long waits alongside missed slots.",
    protects:
      "That the access paradox surfaces as an access finding rather than as an overhead one.",
    answers: A({
      physicians: 2, apps: 1, annualCollections: 3_400_000, clinicalDaysPerWeek: 4,
      patientsPerProviderPerDay: 32, frontOfficeFte: 4, clinicalStaffFte: 5,
      billingModel: "outsourced", billingPercent: 5, noShowRate: 16,
      callsPerDay: 210, unansweredCallPercent: 9, thirdNextAvailableDays: 48,
      physicianAdminHoursPerWeek: 5, priorAuthStaffHoursPerWeek: 8,
      daysInAR: 32, softwareSpendPerMonth: 4_000,
    }),
    invariants: {
      verdictIn: ["act", "watch"],
      leadingCategory: "PATIENT ACCESS",
      scorePublished: true,
      mustInclude: ["no-show-leakage", "access-delay"],
    },
  },
  {
    id: "revenue-cycle-problem",
    name: "Revenue-cycle problem practice",
    represents: "Clinically fine, badly leaking between the visit and the bank.",
    protects:
      "That A/R is reported as one-time working capital and never inflates the recurring range.",
    answers: A({
      physicians: 3, apps: 1, annualCollections: 4_800_000, clinicalDaysPerWeek: 4,
      patientsPerProviderPerDay: 28, frontOfficeFte: 5, clinicalStaffFte: 7,
      billingModel: "outsourced", billingPercent: 9.5, noShowRate: 6,
      callsPerDay: 190, unansweredCallPercent: 7, thirdNextAvailableDays: 12,
      physicianAdminHoursPerWeek: 5, priorAuthStaffHoursPerWeek: 10,
      daysInAR: 78, softwareSpendPerMonth: 5_000,
    }),
    invariants: {
      verdictIn: ["act", "watch"],
      leadingCategory: "REVENUE OPERATIONS",
      mustInclude: ["ar-aging", "billing-cost"],
      oneTimeMayDominate: true,
    },
  },
  {
    id: "physician-admin-overload",
    name: "Physician-admin-overload practice",
    represents: "Excellent revenue, founding physician working every evening.",
    protects:
      "That severe admin load leads the report, and that the finding still requires a real share of the work week.",
    answers: A({
      physicians: 2, apps: 3, annualCollections: 5_200_000, clinicalDaysPerWeek: 4.5,
      patientsPerProviderPerDay: 36, frontOfficeFte: 6, clinicalStaffFte: 9,
      billingModel: "hybrid", billingPercent: 4.5, billingFte: 1, noShowRate: 7,
      callsPerDay: 260, unansweredCallPercent: 11, thirdNextAvailableDays: 26,
      physicianAdminHoursPerWeek: 16, priorAuthStaffHoursPerWeek: 28,
      daysInAR: 36, softwareSpendPerMonth: 7_400,
    }),
    invariants: {
      verdict: "act",
      leadingCategory: "PHYSICIAN TIME",
      scorePublished: true,
      ctaPosture: "standard",
      mustInclude: ["physician-admin-load", "after-hours-load"],
    },
  },
  {
    id: "phone-bottleneck",
    name: "Phone and front-desk bottleneck",
    represents: "A front desk drowning in calls, with patients failing to get through.",
    protects:
      "That a severe unanswered-call rate is material regardless of the modelled revenue figure.",
    answers: A({
      physicians: 1, apps: 0, annualCollections: 1_100_000, clinicalDaysPerWeek: 4,
      patientsPerProviderPerDay: 30, frontOfficeFte: 2, clinicalStaffFte: 2,
      billingModel: "outsourced", billingPercent: 7, noShowRate: 12,
      callsPerDay: 130, unansweredCallPercent: 26, thirdNextAvailableDays: 31,
      physicianAdminHoursPerWeek: 8, priorAuthStaffHoursPerWeek: 6,
      daysInAR: 44, softwareSpendPerMonth: 2_100,
    }),
    invariants: {
      verdictIn: ["act", "watch"],
      mustInclude: ["phone-capacity"],
      scorePublished: true,
      // The phone finding does not lead here: physician admin carries more
      // modelled dollars, and the model ranks by economic magnitude. What must
      // hold is that one call in four going unanswered is treated as material
      // regardless of the revenue figure attached to it.
      findingMustBeHighImpact: "phone-capacity",
      maxRecurringShare: 0.16,
    },
  },
  {
    id: "high-overhead",
    name: "High-overhead, low-leverage group",
    represents: "A decade of added people and software; healthy revenue, poor margin.",
    protects:
      "That overhead surfaces without the audit reaching for layoffs as the finding.",
    answers: A({
      physicians: 3, apps: 2, annualCollections: 5_400_000, clinicalDaysPerWeek: 4.5,
      patientsPerProviderPerDay: 26, frontOfficeFte: 11, clinicalStaffFte: 13,
      billingModel: "in_house", billingFte: 3, noShowRate: 9,
      callsPerDay: 340, unansweredCallPercent: 14, thirdNextAvailableDays: 19,
      physicianAdminHoursPerWeek: 7, priorAuthStaffHoursPerWeek: 34,
      daysInAR: 58, softwareSpendPerMonth: 11_500,
    }),
    invariants: {
      verdictIn: ["act", "watch"],
      scorePublished: true,
      mustInclude: ["overhead-load"],
    },
  },
  {
    id: "technology-sprawl",
    name: "Technology-sprawl practice",
    represents: "A stack that accumulated one decision at a time, and no operating metrics.",
    protects:
      "That software spend alone never manufactures urgency, and that unreportable metrics read as a technology finding.",
    answers: A({
      physicians: 2, apps: 1, annualCollections: 2_800_000, clinicalDaysPerWeek: 4,
      patientsPerProviderPerDay: 26, frontOfficeFte: 4, clinicalStaffFte: 5,
      billingModel: "outsourced", billingPercent: 5.5, noShowRate: 6,
      callsPerDay: 150, unansweredCallPercent: 6, thirdNextAvailableDays: 11,
      physicianAdminHoursPerWeek: 5, priorAuthStaffHoursPerWeek: 7,
      daysInAR: 34, softwareSpendPerMonth: 16_000,
    }),
    invariants: {
      mustInclude: ["software-stack"],
      // Software sprawl is a real observation and never an urgent one. Spend
      // alone must not lead the report or reach high impact, however large the
      // annual figure looks.
      leadingCategoryNot: "TECHNOLOGY",
      findingMustNotBeHighImpact: "software-stack",
      maxRecurringShare: 0.06,
    },
  },
  {
    id: "sparse-data",
    name: "Sparse-data physician",
    represents: "A physician who does not know their own operating numbers.",
    protects:
      "That the audit withholds a verdict rather than extrapolating, and that unknown never becomes zero.",
    answers: A({
      physicians: 2, apps: 0, annualCollections: 2_600_000, clinicalDaysPerWeek: 4,
      patientsPerProviderPerDay: 28, frontOfficeFte: 4, clinicalStaffFte: 5,
      billingModel: "outsourced", billingPercent: 6,
    }),
    invariants: {
      verdict: "insufficient_data",
      scorePublished: false,
      ctaPosture: "soft",
      automationAllowed: false,
    },
  },
  {
    id: "healthy-group",
    name: "Healthy multi-provider group",
    represents: "A well-run group, to prove `healthy` is not a solo-only outcome.",
    protects:
      "That absolute dollar size cannot manufacture urgency at scale.",
    answers: A({
      physicians: 5, apps: 4, annualCollections: 11_500_000, clinicalDaysPerWeek: 4,
      patientsPerProviderPerDay: 30, frontOfficeFte: 9, clinicalStaffFte: 14,
      billingModel: "outsourced", billingPercent: 3.5, noShowRate: 3,
      callsPerDay: 420, unansweredCallPercent: 4, thirdNextAvailableDays: 7,
      physicianAdminHoursPerWeek: 4, priorAuthStaffHoursPerWeek: 14,
      daysInAR: 27, softwareSpendPerMonth: 12_000,
    }),
    invariants: {
      verdict: "healthy",
      scorePublished: true,
      scoreAtLeast: 78,
      ctaPosture: "none",
      automationAllowed: false,
      maxRecurringShare: 0.02,
    },
  },
  {
    id: "very-small",
    name: "Very small practice",
    represents: "A part-time solo practice at the bottom of the addressable range.",
    protects:
      "That small absolute dollars are not dismissed, and that ratios still drive severity.",
    answers: A({
      physicians: 0.5, apps: 0, annualCollections: 420_000, clinicalDaysPerWeek: 2,
      patientsPerProviderPerDay: 18, frontOfficeFte: 1, clinicalStaffFte: 1,
      billingModel: "outsourced", billingPercent: 8, noShowRate: 14,
      callsPerDay: 55, unansweredCallPercent: 22, thirdNextAvailableDays: 21,
      physicianAdminHoursPerWeek: 6, priorAuthStaffHoursPerWeek: 3,
      daysInAR: 52, softwareSpendPerMonth: 900,
    }),
    invariants: {
      scorePublished: true,
      verdictIn: ["act", "watch"],
      mustInclude: ["phone-capacity"],
    },
  },
  {
    id: "large-group",
    name: "Large independent group",
    represents: "The top of the addressable range, with real problems at scale.",
    protects:
      "That severity is driven by ratios rather than by the size of the numbers.",
    answers: A({
      physicians: 12, apps: 8, annualCollections: 28_000_000, clinicalDaysPerWeek: 4.5,
      patientsPerProviderPerDay: 30, frontOfficeFte: 26, clinicalStaffFte: 38,
      billingModel: "in_house", billingFte: 7, noShowRate: 11,
      callsPerDay: 1_100, unansweredCallPercent: 17, thirdNextAvailableDays: 29,
      physicianAdminHoursPerWeek: 10, priorAuthStaffHoursPerWeek: 90,
      daysInAR: 47, softwareSpendPerMonth: 34_000,
    }),
    invariants: {
      verdict: "act",
      scorePublished: true,
      mustInclude: ["phone-capacity", "physician-admin-load"],
    },
  },
  {
    id: "edge-case-zeroes",
    name: "Weird but valid edge case",
    represents:
      "A concierge-style practice: no APPs, no no-shows, no prior auth, tiny volume, high yield.",
    protects:
      "That legitimate zeroes are treated as answers, not as missing data, and never crash a report.",
    answers: A({
      physicians: 1, apps: 0, annualCollections: 900_000, clinicalDaysPerWeek: 3,
      patientsPerProviderPerDay: 8, frontOfficeFte: 1, clinicalStaffFte: 1,
      billingModel: "in_house", billingFte: 0, noShowRate: 0,
      callsPerDay: 20, unansweredCallPercent: 0, thirdNextAvailableDays: 2,
      physicianAdminHoursPerWeek: 0, priorAuthStaffHoursPerWeek: 0,
      daysInAR: 15, softwareSpendPerMonth: 400,
    }),
    invariants: {
      scorePublished: true,
      verdictIn: ["healthy", "watch"],
      mustExclude: ["no-show-leakage", "prior-auth-load", "physician-admin-load"],
    },
  },
];

export function fixtureById(id: string): PracticeFixture | undefined {
  return PRACTICE_FIXTURES.find((f) => f.id === id);
}
