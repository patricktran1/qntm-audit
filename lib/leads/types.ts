import type { AuditResult } from "../engine/types";

/** What a physician can tell us that the audit does not already know. */
export interface LeadInput {
  name: string;
  email: string;
  practiceName: string;
  role: LeadRole;
  location: string;
  website: string;
  concern: string;
  nextStep: NextStepPreference;
  consent: boolean;
  /** Encoded answers, so the brief can be regenerated from the lead alone. */
  report: string;
  /** Opaque pilot session id, joining this lead to its audit. Never personal. */
  sessionId: string;
  /** Sanitised campaign attribution, carried from first touch. */
  attribution: Record<string, string>;
  entryMode: string;
  /** True when the submitting browser is marked as a QA / test device. */
  isTest: boolean;
}

export type LeadRole =
  | "owner_physician"
  | "physician"
  | "administrator"
  | "operations"
  | "other";

export type NextStepPreference = "call" | "email" | "not_yet";

export const LEAD_ROLES: { value: LeadRole; label: string }[] = [
  { value: "owner_physician", label: "Owner / managing physician" },
  { value: "physician", label: "Physician" },
  { value: "administrator", label: "Practice administrator" },
  { value: "operations", label: "Operations / COO" },
  { value: "other", label: "Something else" },
];

export const NEXT_STEPS: {
  value: NextStepPreference;
  label: string;
  help: string;
}[] = [
  {
    value: "call",
    label: "A 30-minute review call",
    help: "We read the report first, then go through it with you.",
  },
  {
    value: "email",
    label: "Written notes by email",
    help: "Our read on the findings. No meeting.",
  },
  {
    value: "not_yet",
    label: "Nothing yet — just save my report",
    help: "We send the link and leave you alone.",
  },
];

/**
 * What actually gets delivered to a sink. Deliberately a superset of the form:
 * practice context is derived from the audit rather than asked for twice.
 */
export interface LeadRecord extends LeadInput {
  receivedAt: string;
  /** Non-identifying practice shape, so a sink can route without re-running the audit. */
  context: {
    verdict: AuditResult["verdict"]["level"];
    posture: AuditResult["offer"]["posture"];
    score: number | null;
    topFinding: string | null;
    topCategory: string | null;
    physicians: number | null;
    opportunityLow: number;
    opportunityHigh: number;
    completeness: number;
    coverage: number;
    /** The single strongest evidence line behind the leading finding. */
    strongestEvidence: string | null;
    modelVersion: string;
  };
  /** Deep link to the internal brief, so the record is actionable on arrival. */
  briefPath: string;
}
