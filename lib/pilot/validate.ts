import { EDITABLE_ASSUMPTIONS } from "../engine/assumptions";
import {
  ATTRIBUTION_KEYS,
  isSessionId,
  sanitizeAttributionValue,
  type Attribution,
  type EntryMode,
} from "./attribution";
import {
  AUDIT_ACCURACIES,
  CALL_OUTCOMES,
  ECONOMIC_REACTIONS,
  NEXT_ACTIONS,
  PAIN_CATEGORIES,
  SERVICES,
  type ActualPain,
  type AssumptionChange,
  type AuditAccuracy,
  type CallOutcome,
  type DiscoveryOutcome,
  type EconomicReaction,
  type NextAction,
  type ServiceName,
} from "./types";

/**
 * Boundary validation for pilot writes. Both endpoints are unauthenticated by
 * necessity (the audit one) or gated (the outcome one), and neither trusts its
 * caller. Every enum is checked against its source list, every string is
 * bounded and stripped, and anything unrecognised is dropped rather than
 * stored — a poisoned pilot dataset is worse than a missing one.
 */

const CONTROL = /[\u0000-\u001F\u007F-\u009F]/g;

export function boundedText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.replace(CONTROL, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function oneOf<T extends string>(
  v: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v)
    ? (v as T)
    : fallback;
}

export function sanitizeAttribution(v: unknown): Attribution {
  if (typeof v !== "object" || v === null) return {};
  const src = v as Record<string, unknown>;
  const out: Attribution = {};
  for (const key of ATTRIBUTION_KEYS) {
    const clean = sanitizeAttributionValue(src[key]);
    if (clean) out[key] = clean;
  }
  return out;
}

export function sanitizeAssumptionChanges(v: unknown): AssumptionChange[] {
  if (!Array.isArray(v)) return [];
  const known = new Set(EDITABLE_ASSUMPTIONS.map((a) => a.key as string));
  const out: AssumptionChange[] = [];
  for (const item of v.slice(0, 40)) {
    if (typeof item !== "object" || item === null) continue;
    const c = item as Record<string, unknown>;
    if (typeof c.key !== "string" || !known.has(c.key)) continue;
    const from = Number(c.from);
    const to = Number(c.to);
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    out.push({
      key: c.key,
      from,
      to,
      direction: to > from ? "up" : "down",
    });
  }
  return out;
}

/**
 * A flush carries only assumption movements for a session that already exists.
 * It is declared by the client rather than inferred from a missing field, so
 * the server never has to guess which of two very different writes it is
 * looking at.
 */
export interface FlushWriteInput {
  sessionId: string;
  report: string;
  assumptionChanges: AssumptionChange[];
}

export type FlushWriteResult =
  | { ok: true; value: FlushWriteInput }
  | { ok: false; error: string };

export function validateFlushWrite(body: unknown): FlushWriteResult {
  if (typeof body !== "object" || body === null)
    return { ok: false, error: "malformed" };
  const b = body as Record<string, unknown>;
  if (!isSessionId(b.sessionId)) return { ok: false, error: "invalid session id" };
  const report = boundedText(b.report, 400);
  if (report.length === 0) return { ok: false, error: "missing report" };
  const assumptionChanges = sanitizeAssumptionChanges(b.assumptionChanges);
  if (assumptionChanges.length === 0)
    return { ok: false, error: "no assumption changes" };
  return { ok: true, value: { sessionId: b.sessionId, report, assumptionChanges } };
}

export interface SessionWriteInput {
  sessionId: string;
  report: string;
  variant: "A" | "B" | null;
  attribution: Attribution;
  entryMode: EntryMode;
  isDemo: boolean;
  isTest: boolean;
  durationMs: number | null;
  firstSeen: string;
  assumptionChanges: AssumptionChange[];
}

export type SessionWriteResult =
  | { ok: true; value: SessionWriteInput }
  | { ok: false; error: string };

export function validateSessionWrite(body: unknown): SessionWriteResult {
  if (typeof body !== "object" || body === null)
    return { ok: false, error: "malformed" };
  const b = body as Record<string, unknown>;

  if (!isSessionId(b.sessionId)) return { ok: false, error: "invalid session id" };

  const report = boundedText(b.report, 400);
  if (report.length === 0) return { ok: false, error: "missing report" };

  const durationRaw = Number(b.durationMs);
  const durationMs =
    Number.isFinite(durationRaw) && durationRaw >= 0 && durationRaw < 86_400_000
      ? Math.round(durationRaw)
      : null;

  const firstSeenRaw = boundedText(b.firstSeen, 40);
  const firstSeen = /^\d{4}-\d{2}-\d{2}T/.test(firstSeenRaw)
    ? firstSeenRaw
    : new Date().toISOString();

  return {
    ok: true,
    value: {
      sessionId: b.sessionId,
      report,
      variant: b.variant === "A" || b.variant === "B" ? b.variant : null,
      attribution: sanitizeAttribution(b.attribution),
      entryMode: b.entryMode === "demo" ? "demo" : "direct",
      isDemo: b.isDemo === true || b.entryMode === "demo",
      // A forged isTest only removes one record from learning — harmless.
      isTest: b.isTest === true,
      durationMs,
      firstSeen,
      assumptionChanges: sanitizeAssumptionChanges(b.assumptionChanges),
    },
  };
}

// ── Discovery outcome ───────────────────────────────────────────────────────

const NOTE_LIMIT = 600;

export type OutcomeWriteResult =
  | { ok: true; value: Omit<DiscoveryOutcome, "modelVersion"> }
  | { ok: false; error: string };

export function validateOutcomeWrite(body: unknown): OutcomeWriteResult {
  if (typeof body !== "object" || body === null)
    return { ok: false, error: "malformed" };
  const b = body as Record<string, unknown>;

  if (!isSessionId(b.sessionId)) return { ok: false, error: "invalid session id" };

  const assumptionKeys = EDITABLE_ASSUMPTIONS.map((a) => a.key as string);
  const challenged = boundedText(b.mostChallengedAssumption, 60);

  return {
    ok: true,
    value: {
      sessionId: b.sessionId,
      recordedAt: new Date().toISOString(),
      callOutcome: oneOf<CallOutcome>(
        b.callOutcome,
        CALL_OUTCOMES.map((o) => o.value),
        "no_call_yet",
      ),
      auditAccuracy: oneOf<AuditAccuracy>(
        b.auditAccuracy,
        AUDIT_ACCURACIES.map((o) => o.value),
        "unable_to_determine",
      ),
      actualPain: oneOf<ActualPain>(b.actualPain, PAIN_CATEGORIES, "other"),
      economicReaction: oneOf<EconomicReaction>(
        b.economicReaction,
        ECONOMIC_REACTIONS.map((o) => o.value),
        "not_discussed",
      ),
      mostChallengedAssumption: assumptionKeys.includes(challenged) ? challenged : "",
      whyBuy: boundedText(b.whyBuy, NOTE_LIMIT),
      whyNotBuy: boundedText(b.whyNotBuy, NOTE_LIMIT),
      serviceRelevant: oneOf<ServiceName>(b.serviceRelevant, SERVICES, "none"),
      nextAction: oneOf<NextAction>(
        b.nextAction,
        NEXT_ACTIONS.map((o) => o.value),
        "none",
      ),
      nextActionNote: boundedText(b.nextActionNote, NOTE_LIMIT),
    },
  };
}
