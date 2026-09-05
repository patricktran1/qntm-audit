// Server-side only: this module reads the environment. It is imported solely
// by server components and route handlers, never by anything with "use client".
import { MODEL_VERSION, PILOT_FREEZE } from "../engine/version";
import { PRACTICE_FIXTURES } from "../engine/fixtures";
import { pilotStore, type ProbeResult } from "./store";

/**
 * PRODUCTION READINESS
 *
 * Every check the operator needs before inviting the first real practice, in
 * one place, computed server-side at request time. Statuses and masked hints
 * only — no token, no webhook URL, and no Redis credential is ever included
 * in what this module returns, because everything it returns is rendered.
 */

export type CheckStatus = "ok" | "warn" | "fail" | "off";

export interface Check {
  name: string;
  status: CheckStatus;
  /** Safe to render. Never a secret, never a complete sensitive URL. */
  detail: string;
}

export interface LastLeadTest {
  at: string;
  ok: boolean;
  sinks: string[];
  failures: string[];
}

export interface ReadinessReport {
  generatedAt: string;
  /** True when every hard requirement for the pilot passes. */
  ready: boolean;
  blockers: string[];
  internalAccess: Check;
  store: Check[];
  storeProbe: ProbeResult | null;
  counts: {
    sessions: number;
    outcomes: number;
    demo: number;
    test: number;
    /** Exactly what "Clear test records" would delete. */
    deletable: number;
  } | null;
  leadSinks: Check[];
  lastLeadTest: LastLeadTest | null;
  analytics: Check[];
  siteUrl: Check;
  model: Check[];
  security: Check[];
}

/** `abc123.upstash.io` → `***.upstash.io`. Enough to recognise, not to use. */
export function maskHost(url: string): string {
  try {
    const host = new URL(url).hostname;
    const parts = host.split(".");
    if (parts.length <= 2) return "***";
    return `***.${parts.slice(1).join(".")}`;
  } catch {
    return "***";
  }
}

export async function readinessReport(requestHost: string | null): Promise<ReadinessReport> {
  const blockers: string[] = [];
  const production = process.env.NODE_ENV === "production";

  // ── Internal access ───────────────────────────────────────────────────────
  const token = process.env.INTERNAL_ACCESS_TOKEN;
  const internalAccess: Check = token
    ? token.length >= 24
      ? { name: "INTERNAL_ACCESS_TOKEN", status: "ok", detail: `Configured (${token.length} characters). Value is never displayed.` }
      : { name: "INTERNAL_ACCESS_TOKEN", status: "warn", detail: `Configured but only ${token.length} characters. Use at least 24 random characters.` }
    : {
        name: "INTERNAL_ACCESS_TOKEN",
        status: production ? "fail" : "warn",
        detail: production
          ? "Missing. Every /internal route fails closed (404) — including this page, so if you are reading this in production, something is wrong."
          : "Missing. Internal surfaces are open in development only; production will fail closed.",
      };
  if (!token) blockers.push("Set INTERNAL_ACCESS_TOKEN so the internal surfaces are reachable in production.");

  // ── Pilot store ───────────────────────────────────────────────────────────
  const store = pilotStore();
  const kvUrl = process.env.PILOT_KV_REST_URL;
  const storeChecks: Check[] = [];
  let storeProbe: ProbeResult | null = null;
  let counts: ReadinessReport["counts"] = null;
  let lastLeadTest: LastLeadTest | null = null;

  if (!store.configured) {
    storeChecks.push({
      name: "PILOT_KV_REST_URL / PILOT_KV_REST_TOKEN",
      status: "fail",
      detail:
        "Not configured. Persistence is a no-op: audits complete normally but nothing is recorded, outcomes cannot be saved, and the pilot learns nothing.",
    });
    blockers.push("Configure the pilot store (PILOT_KV_REST_URL, PILOT_KV_REST_TOKEN) so completed audits are recorded.");
  } else {
    storeChecks.push({
      name: "PILOT_KV_REST_URL / PILOT_KV_REST_TOKEN",
      status: "ok",
      detail: `Configured (${maskHost(kvUrl ?? "")}). Credentials are never displayed.`,
    });
    storeProbe = await store.probe();
    storeChecks.push(
      storeProbe.ok
        ? {
            name: "Store round trip (write → read → delete)",
            status: "ok",
            detail: `Passed in ${storeProbe.latencyMs}ms against a probe key. The probe key is removed afterward and never touches pilot data.`,
          }
        : {
            name: "Store round trip (write → read → delete)",
            status: "fail",
            detail: `Failed: ${storeProbe.error ?? "unknown"}. Check the Upstash database status and both variables.`,
          },
    );
    if (!storeProbe.ok)
      blockers.push("The pilot store is configured but the round-trip check failed.");

    const { sessions, outcomes } = await store.readAll();
    counts = {
      sessions: sessions.length,
      outcomes: outcomes.length,
      // An exclusive partition for display: demo-only, then test (which may
      // also be demo — a marked QA browser visiting /demo produces both).
      demo: sessions.filter((s) => s.isDemo && s.isTest !== true).length,
      test: sessions.filter((s) => s.isTest === true).length,
      // Same predicate deleteTestRecords uses, so the number in the
      // confirmation is the number destroyed.
      deletable: sessions.filter((s) => s.isTest === true).length,
    };

    const rawTest = await store.getMeta("lead_test");
    if (rawTest) {
      try {
        lastLeadTest = JSON.parse(rawTest) as LastLeadTest;
      } catch {
        lastLeadTest = null;
      }
    }
  }

  // ── Lead delivery ─────────────────────────────────────────────────────────
  const webhook = Boolean(process.env.LEAD_WEBHOOK_URL);
  const slack = Boolean(process.env.LEAD_SLACK_WEBHOOK_URL);
  const leadSinks: Check[] = [
    {
      name: "LEAD_WEBHOOK_URL",
      status: webhook ? "ok" : "off",
      detail: webhook
        ? `Configured (${maskHost(process.env.LEAD_WEBHOOK_URL!)}).`
        : "Not configured.",
    },
    {
      name: "LEAD_SLACK_WEBHOOK_URL",
      status: slack ? "ok" : "off",
      detail: slack
        ? `Configured (${maskHost(process.env.LEAD_SLACK_WEBHOOK_URL!)}).`
        : "Not configured.",
    },
  ];
  if (!webhook && !slack) {
    leadSinks.push({
      name: "Any sink",
      status: "warn",
      detail:
        "No lead sink is configured. Leads are accepted and logged server-side only — you will not be notified when a physician asks to talk. Strongly recommended before outreach.",
    });
    blockers.push("Configure at least one lead sink so you are notified when a physician asks to talk.");
  }

  // ── Analytics ─────────────────────────────────────────────────────────────
  // Must match lib/analytics.ts, which is the only consumer. It compares
  // against "true"; reporting on "1" let this page state that telemetry was
  // local while events were being relayed to an external sink.
  const analyticsEnabled = process.env.NEXT_PUBLIC_ANALYTICS_ENABLED === "true";
  const analyticsSink = Boolean(process.env.ANALYTICS_WEBHOOK_URL);
  const analytics: Check[] = [
    {
      name: "NEXT_PUBLIC_ANALYTICS_ENABLED",
      status: analyticsEnabled ? "ok" : "off",
      detail: analyticsEnabled
        ? "Enabled. Events are banded by construction; no raw practice figures leave the browser."
        : "Disabled. The funnel events queue locally only. Optional — the pilot store covers the learning loop.",
    },
    {
      name: "ANALYTICS_WEBHOOK_URL",
      status: analyticsSink ? "ok" : "off",
      detail: analyticsSink
        ? `Configured (${maskHost(process.env.ANALYTICS_WEBHOOK_URL!)}).`
        : "Not configured. Optional.",
    },
  ];

  // ── Site URL ──────────────────────────────────────────────────────────────
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  let siteCheck: Check;
  if (!siteUrl) {
    siteCheck = {
      name: "NEXT_PUBLIC_SITE_URL",
      status: "warn",
      detail: `Not configured. Campaign links and brief links in lead notifications fall back to relative paths${requestHost ? ` (this request arrived at ${requestHost})` : ""}. Set it to the canonical production URL.`,
    };
  } else {
    let configuredHost: string | null = null;
    try {
      configuredHost = new URL(siteUrl).host;
    } catch {
      configuredHost = null;
    }
    if (!configuredHost) {
      siteCheck = {
        name: "NEXT_PUBLIC_SITE_URL",
        status: "fail",
        detail: `Set, but not a valid URL. It must be an absolute https URL.`,
      };
      blockers.push("NEXT_PUBLIC_SITE_URL is set but is not a valid URL.");
    } else if (requestHost && configuredHost !== requestHost) {
      siteCheck = {
        name: "NEXT_PUBLIC_SITE_URL",
        status: "warn",
        detail: `Set to ${siteUrl}, but this request arrived at ${requestHost}. If ${requestHost} is the real production host, links in lead notifications will point at the wrong place.`,
      };
    } else {
      siteCheck = { name: "NEXT_PUBLIC_SITE_URL", status: "ok", detail: siteUrl };
    }
  }

  // ── Model ─────────────────────────────────────────────────────────────────
  const freezeConsistent = !PILOT_FREEZE.active || PILOT_FREEZE.version === MODEL_VERSION;
  const model: Check[] = [
    { name: "Model version", status: "ok", detail: MODEL_VERSION },
    PILOT_FREEZE.active
      ? freezeConsistent
        ? {
            name: "Pilot freeze",
            status: "ok",
            detail: `Active since ${PILOT_FREEZE.startedAt}, pinned to ${PILOT_FREEZE.version}. See MODEL_CHANGELOG.md for what the freeze forbids.`,
          }
        : {
            name: "Pilot freeze",
            status: "fail",
            detail: `Freeze pins ${PILOT_FREEZE.version} but the build is running ${MODEL_VERSION}. The integrity suite should have caught this — do not collect pilot data from this build.`,
          }
      : { name: "Pilot freeze", status: "warn", detail: "No freeze is active." },
    {
      name: "Golden fixtures",
      status: "ok",
      detail: `${PRACTICE_FIXTURES.length} fixture practices asserted at build time by the test suite. A deploy that changes their meaning does not build.`,
    },
  ];
  if (!freezeConsistent)
    blockers.push("The running model version does not match the pilot freeze.");

  // ── Security posture ──────────────────────────────────────────────────────
  const security: Check[] = [
    {
      name: "Internal gate",
      status: token ? "ok" : production ? "fail" : "warn",
      detail: token
        ? "Active. /internal/* requires the token; unauthenticated requests receive 404, not 401."
        : production
          ? "No token in production: everything under /internal fails closed (404). Safe, but unusable."
          : "Open in development only.",
    },
    {
      name: "Fail-closed default",
      status: "ok",
      detail:
        "With no token configured, production serves 404 for every internal route rather than exposing them.",
    },
    {
      name: "Robots / caching",
      status: "ok",
      detail:
        "Internal responses carry x-robots-tag: noindex and cache-control: no-store; robots.txt disallows /internal, /results, /talk, /demo, /api.",
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    ready: blockers.length === 0,
    blockers,
    internalAccess,
    store: storeChecks,
    storeProbe,
    counts,
    leadSinks,
    lastLeadTest,
    analytics,
    siteUrl: siteCheck,
    model,
    security,
  };
}
