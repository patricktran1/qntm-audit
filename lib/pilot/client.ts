import { currentVariant } from "../analytics";
import { pilotIdentity, type Attribution } from "./attribution";
import type { AssumptionChange } from "./types";

/**
 * Client-side pilot plumbing.
 *
 * Two rules everything here obeys:
 *   - never block or break the physician's experience
 *   - never send anything the server could compute for itself
 *
 * The client sends its opaque session id, its attribution, and the encoded
 * answers. Verdict, score, and findings are recomputed server-side.
 */

const PENDING_ASSUMPTIONS = "qntm.pilot.assumptions";

/**
 * Pending movements are scoped to the report they were made on.
 *
 * Share links are a feature, so the report on screen is not necessarily this
 * visitor's own. Without the scope, one slider nudge left a list in
 * localStorage forever, and every later report exit — including a colleague's
 * shared link — posted it under this browser's durable session id.
 */
interface PendingAssumptions {
  report: string;
  changes: AssumptionChange[];
}

function readPending(): PendingAssumptions | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PENDING_ASSUMPTIONS);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingAssumptions>;
    if (typeof parsed?.report !== "string" || !Array.isArray(parsed.changes))
      return null;
    return { report: parsed.report, changes: parsed.changes };
  } catch {
    return null;
  }
}

/** Assumption movements collected while reading one report, for the next write. */
export function rememberAssumptionChange(
  report: string,
  change: AssumptionChange,
): void {
  if (typeof window === "undefined") return;
  try {
    const existing = readPending();
    // A different report is a different practice: start over rather than
    // carrying one reader's movements onto another's record.
    const base = existing && existing.report === report ? existing.changes : [];
    // Keep the latest movement per assumption rather than every drag frame.
    const next = [...base.filter((c) => c.key !== change.key), change];
    window.localStorage.setItem(
      PENDING_ASSUMPTIONS,
      JSON.stringify({ report, changes: next.slice(-40) } satisfies PendingAssumptions),
    );
  } catch {
    // Storage unavailable. The audit is unaffected.
  }
}

/** Movements pending for this exact report. Empty for any other report. */
export function readAssumptionChanges(report: string): AssumptionChange[] {
  const pending = readPending();
  return pending && pending.report === report ? pending.changes : [];
}

/** Drops the pending list. Used on a successful flush and on a demo reset. */
export function clearAssumptionChanges(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PENDING_ASSUMPTIONS);
  } catch {
    // Nothing to do.
  }
}

async function post(path: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface CompletedAuditInput {
  report: string;
  durationMs: number;
  isDemo: boolean;
}

/** Records a completed audit. Never throws, never blocks navigation. */
export async function recordCompletedAudit(
  input: CompletedAuditInput,
): Promise<void> {
  if (typeof window === "undefined") return;
  const identity = pilotIdentity();
  await post("/api/pilot/session", {
    sessionId: identity.sessionId,
    report: input.report,
    variant: currentVariant(),
    attribution: identity.attribution,
    entryMode: input.isDemo ? "demo" : identity.entryMode,
    isDemo: input.isDemo || identity.entryMode === "demo",
    isTest: identity.isTest,
    durationMs: input.durationMs,
    firstSeen: identity.firstSeen,
    assumptionChanges: readAssumptionChanges(input.report),
  });
}

/**
 * Re-sends the session with the assumption movements accumulated while
 * reading. Called when the reader leaves the report, so the pilot learns which
 * assumptions physicians actually challenge.
 */
export async function flushAssumptionChanges(report: string): Promise<void> {
  if (typeof window === "undefined") return;
  const changes = readAssumptionChanges(report);
  if (changes.length === 0) return;
  const identity = pilotIdentity();
  // kind: "flush" is declared, not inferred. The server routes it to an
  // update-only append that can never create a session or replace a stored
  // result — so opening someone else's shared report cannot mint a phantom
  // completed audit, and cannot overwrite this browser's own frozen snapshot.
  const ok = await post("/api/pilot/session", {
    kind: "flush",
    sessionId: identity.sessionId,
    report,
    assumptionChanges: changes,
  });
  // Only drop them once the server has them. This runs on pagehide with
  // keepalive, where delivery is not guaranteed, so a failed post keeps the
  // movements for the next exit rather than losing them.
  if (ok) clearAssumptionChanges();
}

export interface ProgressInput {
  furthestIndex: number;
  /** Answer keys with a value. KEYS ONLY — never pass a value in here. */
  answeredFields: string[];
  /** Answer keys marked "I don't know". */
  unknownFields: string[];
  isDemo: boolean;
  completed: boolean;
}

/**
 * Records how far this visitor has got. Called on each step advance and once
 * more when the tab goes away, so an abandoned audit still teaches us where it
 * was abandoned.
 *
 * Fire-and-forget and never awaited by the UI: a storage problem must not put
 * itself between a physician and the next question.
 */
export function recordProgress(input: ProgressInput): void {
  if (typeof window === "undefined") return;
  const identity = pilotIdentity();
  void post("/api/pilot/progress", {
    sessionId: identity.sessionId,
    furthestIndex: input.furthestIndex,
    answeredFields: input.answeredFields,
    unknownFields: input.unknownFields,
    variant: currentVariant(),
    attribution: identity.attribution,
    entryMode: input.isDemo ? "demo" : identity.entryMode,
    isDemo: input.isDemo || identity.entryMode === "demo",
    isTest: identity.isTest,
    completed: input.completed,
  });
}

/** The identity fields a lead submission carries. */
export function leadIdentity(): {
  sessionId: string;
  attribution: Attribution;
  entryMode: string;
  isTest: boolean;
} {
  const identity = pilotIdentity();
  return {
    sessionId: identity.sessionId,
    attribution: identity.attribution,
    entryMode: identity.entryMode,
    isTest: identity.isTest,
  };
}
