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

/** Assumption movements collected while reading the report, for the next write. */
export function rememberAssumptionChange(change: AssumptionChange): void {
  if (typeof window === "undefined") return;
  try {
    const existing = readAssumptionChanges();
    // Keep the latest movement per assumption rather than every drag frame.
    const next = [...existing.filter((c) => c.key !== change.key), change];
    window.localStorage.setItem(PENDING_ASSUMPTIONS, JSON.stringify(next.slice(-40)));
  } catch {
    // Storage unavailable. The audit is unaffected.
  }
}

export function readAssumptionChanges(): AssumptionChange[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PENDING_ASSUMPTIONS);
    return raw ? (JSON.parse(raw) as AssumptionChange[]) : [];
  } catch {
    return [];
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
    assumptionChanges: readAssumptionChanges(),
  });
}

/**
 * Re-sends the session with the assumption movements accumulated while
 * reading. Called when the reader leaves the report, so the pilot learns which
 * assumptions physicians actually challenge.
 */
export async function flushAssumptionChanges(report: string): Promise<void> {
  if (typeof window === "undefined") return;
  const changes = readAssumptionChanges();
  if (changes.length === 0) return;
  const identity = pilotIdentity();
  await post("/api/pilot/session", {
    sessionId: identity.sessionId,
    report,
    variant: currentVariant(),
    attribution: identity.attribution,
    entryMode: identity.entryMode,
    isDemo: identity.entryMode === "demo",
    isTest: identity.isTest,
    durationMs: null,
    firstSeen: identity.firstSeen,
    assumptionChanges: changes,
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
