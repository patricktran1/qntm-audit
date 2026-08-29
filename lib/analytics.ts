import type { AuditResult, Category } from "./engine/types";

/**
 * ANALYTICS
 *
 * A typed event vocabulary, a queue that survives a missing provider, and one
 * place to swap in a real destination. No vendor SDK, no dashboard.
 *
 * PRIVACY RULE, enforced by the type system rather than by convention: events
 * carry *bands*, never raw values. Collections, names, emails, practice names,
 * and free text never reach this module. If you find yourself wanting to add a
 * raw dollar figure here, add a band instead — see `collectionsBand`.
 */

export type Variant = "A" | "B";

export type ProviderBand = "solo" | "2-3" | "4-8" | "9+" | "unknown";
export type CollectionsBand =
  | "<1M"
  | "1-3M"
  | "3-6M"
  | "6-12M"
  | "12M+"
  | "unknown";
export type ScoreBand = "withheld" | "<50" | "50-64" | "65-79" | "80+";
export type CoverageBand = "<50" | "50-74" | "75-99" | "100";

/** Non-identifying shape of the practice, attached to report-stage events. */
export interface ReportDimensions {
  providerBand: ProviderBand;
  collectionsBand: CollectionsBand;
  scoreBand: ScoreBand;
  coverageBand: CoverageBand;
  verdict: AuditResult["verdict"]["level"];
  posture: AuditResult["offer"]["posture"];
  topCategory: Category | null;
  findingCount: number;
  quantifiedCount: number;
  completenessBand: CoverageBand;
}

export function providerBand(physicians: number | null): ProviderBand {
  if (physicians === null) return "unknown";
  if (physicians <= 1) return "solo";
  if (physicians <= 3) return "2-3";
  if (physicians <= 8) return "4-8";
  return "9+";
}

/** Buckets only. The raw figure is deliberately never emitted. */
export function collectionsBand(collections: number | null): CollectionsBand {
  if (collections === null) return "unknown";
  if (collections < 1_000_000) return "<1M";
  if (collections < 3_000_000) return "1-3M";
  if (collections < 6_000_000) return "3-6M";
  if (collections < 12_000_000) return "6-12M";
  return "12M+";
}

export function scoreBand(overall: number | null): ScoreBand {
  if (overall === null) return "withheld";
  if (overall < 50) return "<50";
  if (overall < 65) return "50-64";
  if (overall < 80) return "65-79";
  return "80+";
}

export function coverageBand(fraction: number): CoverageBand {
  const pct = fraction * 100;
  if (pct < 50) return "<50";
  if (pct < 75) return "50-74";
  if (pct < 100) return "75-99";
  return "100";
}

export function reportDimensions(result: AuditResult): ReportDimensions {
  return {
    providerBand: providerBand(result.answers.physicians),
    collectionsBand: collectionsBand(result.answers.annualCollections),
    scoreBand: scoreBand(result.score.overall),
    coverageBand: coverageBand(result.score.coverage),
    verdict: result.verdict.level,
    posture: result.offer.posture,
    topCategory: result.topOpportunities[0]?.category ?? null,
    findingCount: result.findings.length,
    quantifiedCount: result.quantifiedCount,
    completenessBand: coverageBand(result.completeness),
  };
}

export type AuditEvent =
  // ── Acquisition ──────────────────────────────────────────────────────────
  | { name: "landing_viewed"; variant: Variant }
  | { name: "audit_started"; source: "cta" | "demo" | "resume"; variant: Variant }
  // ── Audit flow ───────────────────────────────────────────────────────────
  | { name: "screen_completed"; step: string; index: number; skipped: string[] }
  | { name: "unknown_selected"; field: string; step: string }
  | { name: "audit_abandoned"; step: string; index: number; furthestIndex: number }
  | {
      name: "audit_completed";
      durationMs: number;
      dimensions: ReportDimensions;
      skippedCount: number;
    }
  // ── Report engagement ────────────────────────────────────────────────────
  | { name: "report_viewed"; dimensions: ReportDimensions; demo: boolean }
  | { name: "score_expanded"; dimension: string }
  | { name: "finding_expanded"; findingId: string; category: Category }
  | { name: "methodology_expanded"; section: string }
  | { name: "assumption_changed"; key: string; value: number; direction: "up" | "down" }
  | { name: "assumptions_reset" }
  // ── Distribution ─────────────────────────────────────────────────────────
  | { name: "summary_copied" }
  | { name: "report_printed" }
  | { name: "report_shared"; method: "clipboard" | "web_share" }
  // ── Conversion ───────────────────────────────────────────────────────────
  | { name: "cta_clicked"; location: string; posture: string; topCategory: Category | null }
  | { name: "lead_form_viewed"; posture: string; topCategory: Category | null }
  | { name: "lead_submitted"; posture: string; topCategory: Category | null; nextStep: string }
  | { name: "booking_clicked" }
  // ── Internal ─────────────────────────────────────────────────────────────
  | { name: "brief_viewed" };

export interface TrackedEvent {
  event: AuditEvent;
  ts: number;
  sessionId: string;
  variant: Variant | null;
}

const STORAGE_KEY = "qntm.analytics.queue";
const SESSION_KEY = "qntm.session";
export const VARIANT_KEY = "qntm.variant";
const MAX_QUEUE = 300;

function sessionId(): string {
  if (typeof window === "undefined") return "server";
  try {
    let id = window.sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = `s_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
      window.sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "anonymous";
  }
}

/** The variant assigned by middleware, mirrored into localStorage for events. */
export function currentVariant(): Variant | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(VARIANT_KEY);
    if (stored === "A" || stored === "B") return stored;
  } catch {
    // Storage unavailable; fall through to the cookie.
  }
  const match = /(?:^|;\s*)qntm_v=(A|B)/.exec(document.cookie);
  return match ? (match[1] as Variant) : null;
}

export function rememberVariant(variant: Variant): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VARIANT_KEY, variant);
  } catch {
    // Private mode. The cookie still carries the assignment.
  }
}

/**
 * Record an event. Writes to sessionStorage so the funnel can be inspected
 * locally, and POSTs to /api/events when a sink is configured. Never throws —
 * analytics must not be able to break the audit.
 */
export function track(event: AuditEvent): void {
  if (typeof window === "undefined") return;
  const payload: TrackedEvent = {
    event,
    ts: Date.now(),
    sessionId: sessionId(),
    variant: currentVariant(),
  };
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

export function clearQueue(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do.
  }
}
