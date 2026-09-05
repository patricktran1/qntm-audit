import type { Attribution, EntryMode } from "./attribution";
import type { Category } from "../engine/types";

/**
 * PILOT RECORDS
 *
 * What we retain about a pilot participant, and — more importantly — what we
 * deliberately do not. See PRIVACY.md.
 *
 * There is no patient-level information anywhere in these types, and no field
 * invites it. Practice figures are stored as bands, exactly as in analytics,
 * with two deliberate exceptions on the lead record where an operator needs
 * the actual value to run a call.
 */

export type VerdictLevel = "healthy" | "watch" | "act" | "insufficient_data";
export type CtaPosture = "none" | "soft" | "standard";

/**
 * The computed snapshot, frozen at completion time alongside the model version
 * that produced it. Calibration must compare a conversation against what the
 * physician was actually shown, not against what today's model would say.
 */
export interface AuditSnapshot {
  modelVersion: string;
  verdict: VerdictLevel;
  posture: CtaPosture;
  score: number | null;
  /** 0–1 share of the scoring model that could be computed. */
  coverage: number;
  /** 0–1 share of questions answered. */
  completeness: number;
  providerBand: string;
  collectionsBand: string;
  topCategory: Category | null;
  /** Every finding category present, deduplicated — not only the leading one. */
  findingCategories: Category[];
  /** Ids of findings in quick-win or strategic-bet buckets. */
  actionableFindingIds: string[];
  quantifiedCount: number;
  /** Banded, never the raw figure. */
  opportunityBand: OpportunityBand;
  /** Which score dimensions could not be computed. */
  unscoredDimensions: string[];
  /** Which questions the practice answered "I don't know". */
  skippedFields: string[];
}

export type OpportunityBand =
  | "none"
  | "<1%"
  | "1-3%"
  | "3-6%"
  | "6-12%"
  | "12%+"
  | "unknown";

/** One assumption a physician moved while reading their report. */
export interface AssumptionChange {
  key: string;
  from: number;
  to: number;
  direction: "up" | "down";
}

export interface PilotSession {
  sessionId: string;
  /** ISO. When the audit was completed, not when the visitor first arrived. */
  completedAt: string;
  firstSeen: string;
  variant: "A" | "B" | null;
  attribution: Attribution;
  entryMode: EntryMode;
  /** True for a synthetic practice loaded from /demo. Excluded from learning. */
  isDemo: boolean;
  /**
   * True for QA traffic: local E2E runs, operator setup checks, readiness
   * probes. Excluded from every learning surface and from default exports,
   * and deletable as a group from /internal/setup. Distinct from isDemo —
   * a demo is a real conversation about a synthetic practice; a test is not
   * a conversation at all.
   */
  isTest: boolean;
  durationMs: number | null;
  snapshot: AuditSnapshot;
  /** Assumption slider movements, appended as they happen. */
  assumptionChanges: AssumptionChange[];
  /** Set when a lead is submitted for this session. */
  leadSubmittedAt: string | null;
  /** Set when the conversion CTA is clicked. */
  ctaClickedAt: string | null;
  /**
   * The encoded answers, so an operator can reopen the exact report. This is
   * practice operating data, not patient data, and it is only ever readable
   * behind the internal gate.
   */
  report: string;
}

// ── Discovery outcomes ──────────────────────────────────────────────────────

export type CallOutcome =
  | "no_call_yet"
  | "spoke"
  | "follow_up"
  | "qualified"
  | "not_qualified"
  | "not_interested"
  | "no_identified_problem"
  | "existing_solution_sufficient";

export type AuditAccuracy =
  | "confirmed"
  | "directionally_correct"
  | "secondary_issue"
  | "incorrect"
  | "unable_to_determine";

export type EconomicReaction =
  | "credible"
  | "directionally_credible"
  | "too_high"
  | "too_low"
  | "not_useful"
  | "not_discussed";

/** The report's own categories, plus the two answers a taxonomy needs. */
export type ActualPain = Category | "none" | "other";

export const CALL_OUTCOMES: { value: CallOutcome; label: string }[] = [
  { value: "no_call_yet", label: "No call yet" },
  { value: "spoke", label: "Spoke" },
  { value: "follow_up", label: "Follow-up scheduled" },
  { value: "qualified", label: "Qualified" },
  { value: "not_qualified", label: "Not qualified" },
  { value: "not_interested", label: "Not interested" },
  { value: "no_identified_problem", label: "No identified problem" },
  { value: "existing_solution_sufficient", label: "Existing solution sufficient" },
];

export const AUDIT_ACCURACIES: { value: AuditAccuracy; label: string; help: string }[] = [
  {
    value: "confirmed",
    label: "Confirmed",
    help: "They recognised the finding as their main problem.",
  },
  {
    value: "directionally_correct",
    label: "Directionally correct",
    help: "Right area, wrong emphasis or magnitude.",
  },
  {
    value: "secondary_issue",
    label: "Secondary issue",
    help: "Real, but not the thing that actually matters to them.",
  },
  {
    value: "incorrect",
    label: "Incorrect",
    help: "The finding did not survive contact. Record this honestly.",
  },
  {
    value: "unable_to_determine",
    label: "Unable to determine",
    help: "The conversation did not get far enough to tell.",
  },
];

export const ECONOMIC_REACTIONS: { value: EconomicReaction; label: string }[] = [
  { value: "credible", label: "Credible" },
  { value: "directionally_credible", label: "Directionally credible" },
  { value: "too_high", label: "Too high" },
  { value: "too_low", label: "Too low" },
  { value: "not_useful", label: "Not useful" },
  { value: "not_discussed", label: "Not discussed" },
];

export const PAIN_CATEGORIES: ActualPain[] = [
  "PHYSICIAN TIME",
  "PATIENT ACCESS",
  "REVENUE OPERATIONS",
  "OVERHEAD",
  "FRONT OFFICE",
  "TECHNOLOGY",
  "none",
  "other",
];

/** Must match the service names used by lib/engine/brief.ts. */
export const SERVICES = [
  "AI phone agent / inbound triage",
  "Virtual staffing / offshore front office",
  "Revenue cycle optimization",
  "Workflow automation (prior auth, intake, recalls)",
  "Documentation / physician time recovery",
  "EHR / technology stack review",
  "none",
] as const;
export type ServiceName = (typeof SERVICES)[number];

export type NextAction =
  | "none"
  | "awaiting_reply"
  | "second_call"
  | "proposal_sent"
  | "pilot_agreed"
  | "closed_lost"
  | "revisit_later";

export const NEXT_ACTIONS: { value: NextAction; label: string }[] = [
  { value: "none", label: "Nothing scheduled" },
  { value: "awaiting_reply", label: "Awaiting reply" },
  { value: "second_call", label: "Second call booked" },
  { value: "proposal_sent", label: "Proposal sent" },
  { value: "pilot_agreed", label: "Pilot agreed" },
  { value: "closed_lost", label: "Closed lost" },
  { value: "revisit_later", label: "Revisit later" },
];

/**
 * What an operator records after a discovery conversation. This is the whole
 * point of the pilot: it is the only place where the model's prediction meets
 * a real dermatologist's opinion.
 */
export interface DiscoveryOutcome {
  sessionId: string;
  recordedAt: string;
  /** The model that produced the report the call was about. */
  modelVersion: string;
  callOutcome: CallOutcome;
  auditAccuracy: AuditAccuracy;
  actualPain: ActualPain;
  economicReaction: EconomicReaction;
  /** Assumption key from EDITABLE_ASSUMPTIONS, or empty. */
  mostChallengedAssumption: string;
  whyBuy: string;
  whyNotBuy: string;
  serviceRelevant: ServiceName;
  nextAction: NextAction;
  nextActionNote: string;
  /** Free-text operator note length cap, enforced server-side. */
}

export interface PilotSummary {
  sessions: PilotSession[];
  outcomes: DiscoveryOutcome[];
  /**
   * Set when the read itself failed. Absent on success, including a genuinely
   * empty store. Operator paths that would otherwise emit a valid-looking
   * empty export must check this; physician-facing paths ignore it and carry
   * on with nothing, as before.
   */
  readFailed?: boolean;
}
