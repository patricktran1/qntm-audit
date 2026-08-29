/**
 * QNTM PRACTICE AUDIT — domain types.
 *
 * Design rule: every number this product shows a physician must be traceable to
 * (a) something they typed, or (b) a named, editable assumption. There is no
 * third category. We deliberately ship no "industry benchmark" numbers — see
 * docs/MODEL.md for why.
 */

/** `null` means the user answered "I don't know". It is a first-class answer. */
export type NumericAnswer = number | null;

export type Confidence = "high" | "medium" | "low";
export type Level = "low" | "medium" | "high";

export type BillingModel = "outsourced" | "in_house" | "hybrid";

export interface AuditAnswers {
  /** Full-time-equivalent physicians (MD/DO) seeing patients. */
  physicians: NumericAnswer;
  /** Full-time-equivalent advanced practice providers (PA/NP). */
  apps: NumericAnswer;
  /** Total annual collections (money actually received), not charges. */
  annualCollections: NumericAnswer;
  /** Clinic days per week for a typical provider. */
  clinicalDaysPerWeek: NumericAnswer;
  /** Patients seen per provider on a typical clinic day. */
  patientsPerProviderPerDay: NumericAnswer;
  /** FTE front-desk / phones / scheduling / check-in staff. */
  frontOfficeFte: NumericAnswer;
  /** FTE medical assistants / clinical support staff. */
  clinicalStaffFte: NumericAnswer;
  billingModel: BillingModel | null;
  /** Percentage of collections paid to a billing company (outsourced/hybrid). */
  billingPercent: NumericAnswer;
  /** FTE in-house billing / RCM staff (in_house/hybrid). */
  billingFte: NumericAnswer;
  /** No-show + same-day cancellation rate, as a percentage of booked slots. */
  noShowRate: NumericAnswer;
  /** Inbound patient calls on a typical clinic day. */
  callsPerDay: NumericAnswer;
  /** Percentage of those calls that ring out, abandon, or hit voicemail. */
  unansweredCallPercent: NumericAnswer;
  /** Days until the third-next-available new-patient appointment. */
  thirdNextAvailableDays: NumericAnswer;
  /** Hours per week a physician spends on admin (charting, inbox, PA, forms). */
  physicianAdminHoursPerWeek: NumericAnswer;
  /** Staff hours per week spent on prior authorizations. */
  priorAuthStaffHoursPerWeek: NumericAnswer;
  /** Days in accounts receivable. */
  daysInAR: NumericAnswer;
  /** Total practice software spend per month (EHR, PM, phones, portal, etc.). */
  softwareSpendPerMonth: NumericAnswer;
}

/**
 * Every assumption the engine uses, in one place, all user-editable in the UI.
 * Defaults are conservative planning values, not published benchmarks.
 */
export interface Assumptions {
  /** Clinic weeks worked per year after vacation, CME, and holidays. */
  clinicalWeeksPerYear: number;
  /** Scheduled patient-facing hours in a clinic day. */
  hoursPerClinicalDay: number;
  /**
   * Marginal contribution margin: cents of profit kept per incremental dollar
   * collected once fixed costs are already covered. Used so we never value a
   * recovered hour or slot at full gross revenue.
   */
  contributionMargin: number;
  /** Fully loaded hourly cost (wage + payroll tax + benefits) by staff type. */
  frontOfficeLoadedHourlyCost: number;
  clinicalStaffLoadedHourlyCost: number;
  billingStaffLoadedHourlyCost: number;
  /** Paid hours per FTE per year. */
  workingHoursPerFteYear: number;
  /** Share of no-show slots that could realistically have been refilled. */
  noShowRecaptureRate: number;
  /** Average staff minutes consumed by one handled inbound call. */
  callHandleMinutes: number;
  /** Share of unanswered callers who try again rather than going elsewhere. */
  callbackRate: number;
  /** Share of inbound calls that are new-patient appointment requests. */
  newPatientCallShare: number;
  /** Visits a new patient generates in their first year. */
  visitsPerNewPatientYearOne: number;
}

export interface Metric {
  key: string;
  label: string;
  value: number | null;
  unit: "currency" | "percent" | "number" | "hours" | "days" | "ratio";
  /** Human-readable formula, shown verbatim in the Assumptions section. */
  formula: string;
  /** Which answers and assumptions this depends on. */
  basis: string[];
  confidence: Confidence;
  note?: string;
}

export type Category =
  | "PATIENT ACCESS"
  | "FRONT OFFICE"
  | "PHYSICIAN TIME"
  | "REVENUE OPERATIONS"
  | "OVERHEAD"
  | "TECHNOLOGY";

export type AutomationWorkflow =
  | "phone_triage"
  | "scheduling"
  | "reminders_recalls"
  | "prior_auth"
  | "patient_intake"
  | "documentation"
  | "billing_followup"
  | "patient_faq"
  | "referral_intake"
  | "review_requests";

export interface EvidenceLine {
  label: string;
  value: string;
  /** True when this line came straight from the user, false when derived. */
  reported: boolean;
}

export interface Estimate {
  /** Conservative end of the annual range, in dollars. */
  low: number;
  /** Optimistic end of the annual range, in dollars. */
  high: number;
  formula: string;
  assumptions: string[];
  /** What the money actually is: recoverable cash, freed capacity, or cost. */
  kind: "recoverable" | "freed_capacity" | "current_cost";
  /**
   * Recurring annual value vs. a one-time release (e.g. working capital freed
   * by shortening A/R). Mixing these into one headline number is the fastest
   * way to lose a CFO, so they are totalled separately.
   */
  recurrence: "annual" | "one_time";
}

export type Bucket = "quick_win" | "strategic_bet" | "monitor" | "low_priority";

export interface Finding {
  id: string;
  category: Category;
  title: string;
  /** One sentence a physician can repeat back. */
  headline: string;
  evidence: EvidenceLine[];
  interpretation: string;
  estimate: Estimate | null;
  impact: Level;
  effort: Level;
  confidence: Confidence;
  automation: AutomationWorkflow | null;
  nextStep: string;
  /** Assigned by prioritize(). */
  bucket: Bucket;
  rank: number;
}

export interface DimensionScore {
  key: string;
  label: string;
  category: Category;
  weight: number;
  /** 0–100, or null when we lack the inputs to score it honestly. */
  score: number | null;
  confidence: Confidence;
  /** Plain-language reason for the score, referencing the user's numbers. */
  rationale: string;
  /** The scoring anchors used, so the user can audit the curve. */
  anchors: string;
}

export interface PracticeScore {
  /** 0–100 weighted composite of the scored dimensions. */
  overall: number | null;
  band: string;
  bandDescription: string;
  dimensions: DimensionScore[];
  /** Share of total weight we were able to score, 0–1. */
  coverage: number;
  scoredCount: number;
  totalCount: number;
}

export interface OpenQuestion {
  question: string;
  why: string;
  category: Category;
}

export interface ActionItem {
  week: string;
  action: string;
  owner: string;
  /** What measuring this unlocks. */
  unlocks: string;
}

export interface AuditResult {
  answers: AuditAnswers;
  assumptions: Assumptions;
  metrics: Metric[];
  score: PracticeScore;
  findings: Finding[];
  topOpportunities: Finding[];
  openQuestions: OpenQuestion[];
  plan: ActionItem[];
  executiveSummary: string[];
  /** Recurring annual value across quantified findings. Not strictly additive. */
  opportunityLow: number;
  opportunityHigh: number;
  /** One-time cash release, kept out of the annual figure on purpose. */
  oneTimeLow: number;
  oneTimeHigh: number;
  /** How many distinct findings contribute to the annual range. */
  quantifiedCount: number;
  /**
   * True when the summed findings exceeded the conservatism ceiling and the
   * reported total was capped. Disclosed in the report rather than hidden.
   */
  opportunityCapped: boolean;
  automationCandidates: AutomationCandidate[];
  completeness: number;
  /** The one conclusion the audit stands behind. Drives the report and the CTA. */
  verdict: import("./verdict").Verdict;
  /** How, and whether, to ask for a conversation. Derived from the verdict. */
  offer: import("./verdict").ConversionOffer;
}

export interface AutomationCandidate {
  workflow: AutomationWorkflow;
  label: string;
  /** Why *their* answers point here. */
  trigger: string;
  hoursPerYear: number | null;
  annualLaborCost: number | null;
  confidence: Confidence;
  readiness: string;
}
