import type { AuditAnswers, BillingModel } from "./types";

export type FieldKey = keyof AuditAnswers;

export interface NumericField {
  kind: "numeric";
  key: Exclude<FieldKey, "billingModel">;
  label: string;
  /** Shown under the input. Explains why we ask, in one line. */
  help?: string;
  unit: "currency" | "percent" | "number";
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  suffix?: string;
  /** Allow "I don't know". Some fields are load-bearing and cannot be skipped. */
  skippable: boolean;
  /** Shown only when this predicate passes. */
  showIf?: (a: AuditAnswers) => boolean;
}

export interface ChoiceField {
  kind: "choice";
  key: "billingModel";
  label: string;
  help?: string;
  options: { value: BillingModel; label: string; description: string }[];
  skippable: boolean;
}

export type Field = NumericField | ChoiceField;

export interface Step {
  id: string;
  title: string;
  /** The question, phrased for a physician, not a form. */
  prompt: string;
  /** Why this step matters — builds trust and reduces abandonment. */
  rationale: string;
  fields: Field[];
}

const isBilledOut = (a: AuditAnswers) =>
  a.billingModel === "outsourced" || a.billingModel === "hybrid";
const isBilledIn = (a: AuditAnswers) =>
  a.billingModel === "in_house" || a.billingModel === "hybrid";

export const STEPS: Step[] = [
  {
    id: "providers",
    title: "Providers",
    prompt: "Who sees patients?",
    rationale:
      "Provider count is the denominator for almost everything else: revenue per physician, staff ratios, and the value of an hour of your time.",
    fields: [
      {
        kind: "numeric",
        key: "physicians",
        label: "Physicians (FTE)",
        help: "Count 0.5 for a half-time physician.",
        unit: "number",
        min: 0.25,
        max: 60,
        step: 0.25,
        placeholder: "2",
        skippable: false,
      },
      {
        kind: "numeric",
        key: "apps",
        label: "PAs / NPs (FTE)",
        help: "Enter 0 if you have none.",
        unit: "number",
        min: 0,
        max: 60,
        step: 0.25,
        placeholder: "1",
        skippable: false,
      },
    ],
  },
  {
    id: "volume",
    title: "Clinic volume",
    prompt: "How much clinic do you actually run?",
    rationale:
      "Days and patients per day let us compute your true collections per clinic hour — the number that prices every hour you spend on administrative work.",
    fields: [
      {
        kind: "numeric",
        key: "clinicalDaysPerWeek",
        label: "Clinic days per week",
        help: "For a typical provider. Half-days count as 0.5.",
        unit: "number",
        min: 0.5,
        max: 7,
        step: 0.5,
        placeholder: "4",
        skippable: false,
      },
      {
        kind: "numeric",
        key: "patientsPerProviderPerDay",
        label: "Patients per provider per clinic day",
        help: "Average across your providers on a normal day.",
        unit: "number",
        min: 1,
        max: 120,
        step: 1,
        placeholder: "32",
        skippable: false,
      },
    ],
  },
  {
    id: "revenue",
    title: "Collections",
    prompt: "What does the practice collect in a year?",
    rationale:
      "Collections, not charges. This anchors every dollar figure in the report. If you only know a range, enter the low end — the audit is built to understate.",
    fields: [
      {
        kind: "numeric",
        key: "annualCollections",
        label: "Annual collections",
        help: "Money actually received last year, across all providers and ancillaries.",
        unit: "currency",
        min: 0,
        max: 200_000_000,
        step: 10_000,
        placeholder: "2,400,000",
        skippable: false,
      },
    ],
  },
  {
    id: "staff",
    title: "Staffing",
    prompt: "Who supports the clinic?",
    rationale:
      "Staff cost is usually the largest controllable line in a practice. We use these counts to estimate where labor capacity is going, not just what it costs.",
    fields: [
      {
        kind: "numeric",
        key: "frontOfficeFte",
        label: "Front office (FTE)",
        help: "Phones, scheduling, check-in, check-out, records.",
        unit: "number",
        min: 0,
        max: 100,
        step: 0.5,
        placeholder: "4",
        skippable: false,
      },
      {
        kind: "numeric",
        key: "clinicalStaffFte",
        label: "Clinical support (FTE)",
        help: "Medical assistants, nurses, scribes, techs.",
        unit: "number",
        min: 0,
        max: 200,
        step: 0.5,
        placeholder: "6",
        skippable: false,
      },
    ],
  },
  {
    id: "billing",
    title: "Billing",
    prompt: "How does money get collected?",
    rationale:
      "Billing cost and A/R speed are the two places where revenue quietly disappears between the visit and the bank.",
    fields: [
      {
        kind: "choice",
        key: "billingModel",
        label: "Billing model",
        options: [
          {
            value: "outsourced",
            label: "Outsourced",
            description: "A billing company takes a percentage.",
          },
          {
            value: "in_house",
            label: "In-house",
            description: "Your own staff handle billing and follow-up.",
          },
          {
            value: "hybrid",
            label: "Hybrid",
            description: "Both — internal staff plus an outside vendor.",
          },
        ],
        skippable: false,
      },
      {
        kind: "numeric",
        key: "billingPercent",
        label: "Billing company fee",
        unit: "percent",
        min: 0,
        max: 15,
        step: 0.1,
        suffix: "% of collections",
        placeholder: "6",
        skippable: true,
        showIf: isBilledOut,
      },
      {
        kind: "numeric",
        key: "billingFte",
        label: "In-house billing staff (FTE)",
        unit: "number",
        min: 0,
        max: 50,
        step: 0.5,
        placeholder: "2",
        skippable: true,
        showIf: isBilledIn,
      },
      {
        kind: "numeric",
        key: "daysInAR",
        label: "Days in A/R",
        help: "Your practice management system reports this. Skip if you don't track it — that itself is a finding.",
        unit: "number",
        min: 0,
        max: 240,
        step: 1,
        placeholder: "38",
        skippable: true,
      },
    ],
  },
  {
    id: "access",
    title: "Patient access",
    prompt: "How hard is it to get in?",
    rationale:
      "Access problems show up as revenue problems one or two quarters later. These three numbers usually predict the rest of the practice.",
    fields: [
      {
        kind: "numeric",
        key: "thirdNextAvailableDays",
        label: "Third-next-available new patient appointment",
        help: "Days out. Use the third opening, not the first — the first is usually a cancellation.",
        unit: "number",
        min: 0,
        max: 365,
        step: 1,
        suffix: "days",
        placeholder: "24",
        skippable: true,
      },
      {
        kind: "numeric",
        key: "noShowRate",
        label: "No-show + same-day cancellation rate",
        unit: "percent",
        min: 0,
        max: 60,
        step: 0.5,
        suffix: "% of booked slots",
        placeholder: "9",
        skippable: true,
      },
    ],
  },
  {
    id: "phones",
    title: "Phones",
    prompt: "What is happening on the phones?",
    rationale:
      "The phone is where most independent practices silently lose both staff capacity and new patients. Estimates are fine here — we treat them as estimates.",
    fields: [
      {
        kind: "numeric",
        key: "callsPerDay",
        label: "Inbound calls on a typical clinic day",
        help: "A rough count is fine. Your phone system can give you the exact number.",
        unit: "number",
        min: 0,
        max: 3000,
        step: 5,
        placeholder: "180",
        skippable: true,
      },
      {
        kind: "numeric",
        key: "unansweredCallPercent",
        label: "Calls that ring out, abandon, or go to voicemail",
        unit: "percent",
        min: 0,
        max: 90,
        step: 1,
        suffix: "%",
        placeholder: "20",
        skippable: true,
      },
    ],
  },
  {
    id: "load",
    title: "Administrative load",
    prompt: "Where does the non-clinical time go?",
    rationale:
      "This is the question most practices have never priced. We convert these hours into dollars using your own collections per clinical hour.",
    fields: [
      {
        kind: "numeric",
        key: "physicianAdminHoursPerWeek",
        label: "Physician admin hours per week",
        help: "Per physician. Charting after clinic, inbox, refills, forms, prior auth appeals.",
        unit: "number",
        min: 0,
        max: 60,
        step: 0.5,
        suffix: "hrs/wk",
        placeholder: "9",
        skippable: true,
      },
      {
        kind: "numeric",
        key: "priorAuthStaffHoursPerWeek",
        label: "Staff hours per week on prior authorizations",
        help: "Across the whole practice. Dermatology biologics and Mohs pre-certs concentrate here.",
        unit: "number",
        min: 0,
        max: 400,
        step: 1,
        suffix: "hrs/wk",
        placeholder: "18",
        skippable: true,
      },
    ],
  },
  {
    id: "tech",
    title: "Technology",
    prompt: "What does the software stack cost?",
    rationale:
      "Not to shame the number — to see it per provider, and to see whether the stack is absorbing work or creating it.",
    fields: [
      {
        kind: "numeric",
        key: "softwareSpendPerMonth",
        label: "Total software spend per month",
        help: "EHR, practice management, phones, patient portal, reminders, payments, marketing tools.",
        unit: "currency",
        min: 0,
        max: 500_000,
        step: 100,
        placeholder: "6,500",
        skippable: true,
      },
    ],
  },
];

export const EMPTY_ANSWERS: AuditAnswers = {
  physicians: null,
  apps: null,
  annualCollections: null,
  clinicalDaysPerWeek: null,
  patientsPerProviderPerDay: null,
  frontOfficeFte: null,
  clinicalStaffFte: null,
  billingModel: null,
  billingPercent: null,
  billingFte: null,
  noShowRate: null,
  callsPerDay: null,
  unansweredCallPercent: null,
  thirdNextAvailableDays: null,
  physicianAdminHoursPerWeek: null,
  priorAuthStaffHoursPerWeek: null,
  daysInAR: null,
  softwareSpendPerMonth: null,
};

/** Fields visible for the current answers, in order. */
export function visibleFields(step: Step, answers: AuditAnswers): Field[] {
  return step.fields.filter((f) =>
    f.kind === "numeric" && f.showIf ? f.showIf(answers) : true,
  );
}

/** A step is satisfied when every visible non-skippable field has a value. */
export function isStepComplete(step: Step, answers: AuditAnswers): boolean {
  return visibleFields(step, answers).every((f) => {
    if (f.skippable) return true;
    return answers[f.key] !== null && answers[f.key] !== undefined;
  });
}

/**
 * The answer keys a practice is actually asked, given its own answers. The two
 * billing sub-questions are mutually exclusive, so a practice using an outside
 * biller is never shown the in-house FTE field — counting it as "skipped"
 * would report a question nobody was asked as one physicians cannot answer.
 */
export function relevantFields(answers: AuditAnswers): (keyof AuditAnswers)[] {
  const keys = Object.keys(EMPTY_ANSWERS) as (keyof AuditAnswers)[];
  return keys.filter((k) => {
    if (k === "billingPercent") return isBilledOut(answers);
    if (k === "billingFte") return isBilledIn(answers);
    return true;
  });
}

/** Fields the practice was asked and answered "I don't know" to. */
export function skippedFields(answers: AuditAnswers): (keyof AuditAnswers)[] {
  return relevantFields(answers).filter((k) => answers[k] === null);
}

/** 0–1. How much of the possible signal the user actually gave us. */
export function completeness(answers: AuditAnswers): number {
  const relevant = relevantFields(answers);
  const answered = relevant.filter((k) => answers[k] !== null).length;
  return relevant.length === 0 ? 0 : answered / relevant.length;
}
