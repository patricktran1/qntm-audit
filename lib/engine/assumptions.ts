import type { Assumptions } from "./types";

/**
 * DEFAULT ASSUMPTIONS
 *
 * These are planning defaults, not published benchmarks. We chose values that
 * make the audit *understate* opportunity rather than overstate it, because the
 * product's job is to survive a CFO reading it. Every one is editable in the UI
 * and every number in the report recomputes when they change.
 */
export const DEFAULT_ASSUMPTIONS: Assumptions = {
  // 52 weeks less ~4 vacation, ~1 CME, ~1 holiday-equivalent.
  clinicalWeeksPerYear: 46,
  // Scheduled patient-facing hours, excluding charting time.
  hoursPerClinicalDay: 8,
  // A recovered hour or slot does not yield gross revenue; it yields revenue
  // less the variable cost of delivering it (supplies, staff time, materials).
  // 0.55 is deliberately below a typical procedural-practice marginal margin.
  contributionMargin: 0.55,
  frontOfficeLoadedHourlyCost: 26,
  clinicalStaffLoadedHourlyCost: 34,
  billingStaffLoadedHourlyCost: 30,
  workingHoursPerFteYear: 2080,
  // Half of missed slots are assumed unfillable on short notice.
  noShowRecaptureRate: 0.5,
  callHandleMinutes: 4.5,
  // Most patients call back; only the remainder are truly lost.
  callbackRate: 0.7,
  newPatientCallShare: 0.1,
  visitsPerNewPatientYearOne: 2.2,
};

export interface AssumptionMeta {
  key: keyof Assumptions;
  label: string;
  help: string;
  unit: "currency" | "percent" | "number";
  min: number;
  max: number;
  step: number;
  /** How much of the report moves when this changes. */
  sensitivity: "high" | "medium" | "low";
}

/** Only the assumptions worth exposing. The rest are structural. */
export const EDITABLE_ASSUMPTIONS: AssumptionMeta[] = [
  {
    key: "contributionMargin",
    label: "Marginal contribution margin",
    help: "Cents of profit kept on each additional dollar collected, once fixed costs are already covered. Drives every opportunity-cost figure in this report.",
    unit: "percent",
    min: 0.2,
    max: 0.9,
    step: 0.01,
    sensitivity: "high",
  },
  {
    key: "clinicalWeeksPerYear",
    label: "Clinic weeks per year",
    help: "Weeks actually worked after vacation, CME, and holidays.",
    unit: "number",
    min: 40,
    max: 50,
    step: 1,
    sensitivity: "high",
  },
  {
    key: "hoursPerClinicalDay",
    label: "Patient-facing hours per clinic day",
    help: "Scheduled clinical hours, excluding charting and inbox time.",
    unit: "number",
    min: 4,
    max: 12,
    step: 0.5,
    sensitivity: "high",
  },
  {
    key: "frontOfficeLoadedHourlyCost",
    label: "Front-office loaded hourly cost",
    help: "Wage plus payroll tax and benefits, per hour.",
    unit: "currency",
    min: 15,
    max: 60,
    step: 1,
    sensitivity: "medium",
  },
  {
    key: "clinicalStaffLoadedHourlyCost",
    label: "Clinical staff loaded hourly cost",
    help: "Medical assistants and clinical support, fully loaded.",
    unit: "currency",
    min: 18,
    max: 80,
    step: 1,
    sensitivity: "medium",
  },
  {
    key: "noShowRecaptureRate",
    label: "No-show slots realistically refillable",
    help: "Share of missed slots that a waitlist or same-day fill could plausibly recover. Set this to 0 if your schedule has no backfill demand.",
    unit: "percent",
    min: 0,
    max: 1,
    step: 0.05,
    sensitivity: "high",
  },
  {
    key: "callHandleMinutes",
    label: "Staff minutes per handled call",
    help: "Average talk time plus the work the call creates afterward.",
    unit: "number",
    min: 1,
    max: 15,
    step: 0.5,
    sensitivity: "medium",
  },
  {
    key: "callbackRate",
    label: "Unanswered callers who try again",
    help: "The rest are treated as permanently lost. Raising this lowers the estimated revenue impact of missed calls.",
    unit: "percent",
    min: 0,
    max: 1,
    step: 0.05,
    sensitivity: "medium",
  },
  {
    key: "newPatientCallShare",
    label: "Inbound calls that are new-patient requests",
    help: "The weakest assumption in this report. One week of call-reason tagging replaces it with a real number.",
    unit: "percent",
    min: 0.01,
    max: 0.5,
    step: 0.01,
    sensitivity: "medium",
  },
];
