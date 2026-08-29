/**
 * Analytics abstraction. Deliberately thin: a named event vocabulary, a
 * queue that survives a missing provider, and one place to swap in a real
 * destination later. No console, no dashboard, no vendor SDK.
 */

export type AuditEvent =
  | { name: "landing_viewed" }
  | { name: "audit_started"; source: "cta" | "demo" | "resume" }
  | { name: "demo_profile_loaded"; profile: string }
  | { name: "step_completed"; step: string; index: number; skipped: string[] }
  | { name: "field_skipped"; field: string }
  | { name: "audit_abandoned"; step: string; index: number }
  | {
      name: "audit_completed";
      durationMs: number;
      completeness: number;
      score: number | null;
      skippedCount: number;
      topCategory: string | null;
    }
  | { name: "results_viewed"; score: number | null }
  | { name: "assumption_changed"; key: string; value: number }
  | { name: "report_downloaded"; format: "pdf" | "clipboard" }
  | { name: "report_shared" }
  | { name: "brief_viewed" }
  | { name: "cta_clicked"; location: string }
  | { name: "consultation_requested"; hasEmail: boolean };

export interface TrackedEvent {
  event: AuditEvent;
  ts: number;
  sessionId: string;
}

const STORAGE_KEY = "qntm.analytics.queue";
const SESSION_KEY = "qntm.session";
const MAX_QUEUE = 200;

function sessionId(): string {
  if (typeof window === "undefined") return "server";
  let id = window.sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = `s_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    window.sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

/**
 * Record an event. Writes to sessionStorage so the founder can inspect a real
 * funnel locally, and POSTs to /api/events when a sink is configured. Never
 * throws — analytics must not be able to break the audit.
 */
export function track(event: AuditEvent): void {
  if (typeof window === "undefined") return;
  const payload: TrackedEvent = { event, ts: Date.now(), sessionId: sessionId() };
  try {
    const existing = readQueue();
    existing.push(payload);
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(existing.slice(-MAX_QUEUE)),
    );
  } catch {
    // sessionStorage unavailable (private mode, quota). Not worth surfacing.
  }
  try {
    if (process.env.NEXT_PUBLIC_ANALYTICS_ENABLED === "true") {
      void fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Network failure is never the user's problem.
  }
}

export function readQueue(): TrackedEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TrackedEvent[]) : [];
  } catch {
    return [];
  }
}
