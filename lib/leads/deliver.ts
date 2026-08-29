import type { LeadRecord } from "./types";

/**
 * LEAD DELIVERY
 *
 * One abstraction, several sinks, all optional. With nothing configured the
 * lead is accepted and logged server-side only — the product still works and
 * the UI can honestly confirm receipt, which is what an MVP needs.
 *
 * Secrets are read from the environment at call time and never leave the
 * server. Nothing in this file is imported by a client component.
 */

export interface DeliveryResult {
  delivered: boolean;
  /** Sinks that accepted the lead. */
  sinks: string[];
  /** Configured sinks that failed. Never surfaced verbatim to a user. */
  failures: string[];
}

interface Sink {
  name: string;
  configured: () => boolean;
  send: (lead: LeadRecord) => Promise<void>;
}

const TIMEOUT_MS = 8000;

async function postJson(url: string, body: unknown) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(String(res.status));
  } finally {
    clearTimeout(timer);
  }
}

const SINKS: Sink[] = [
  {
    name: "webhook",
    configured: () => Boolean(process.env.LEAD_WEBHOOK_URL),
    send: (lead) => postJson(process.env.LEAD_WEBHOOK_URL!, lead),
  },
  {
    name: "slack",
    configured: () => Boolean(process.env.LEAD_SLACK_WEBHOOK_URL),
    send: (lead) =>
      postJson(process.env.LEAD_SLACK_WEBHOOK_URL!, { text: slackText(lead) }),
  },
];

/** A Slack message a salesperson can act on without opening anything else. */
function slackText(lead: LeadRecord): string {
  const c = lead.context;
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  return [
    `*New practice audit lead* — ${lead.practiceName || "practice not given"}`,
    `${lead.name || "Name not given"} · ${lead.role} · ${lead.email}`,
    lead.location || null,
    `Verdict *${c.verdict}* · posture ${c.posture} · score ${
      c.score ?? "withheld"
    } · ${c.physicians ?? "?"} physicians`,
    c.topFinding ? `Top finding: ${c.topFinding}` : null,
    `Wants: ${lead.nextStep}`,
    lead.concern ? `In their words: "${lead.concern.slice(0, 400)}"` : null,
    `Brief: ${base}${lead.briefPath}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function deliverLead(lead: LeadRecord): Promise<DeliveryResult> {
  const active = SINKS.filter((s) => s.configured());

  if (active.length === 0) {
    // No sink configured. Accepting is the honest behaviour for an MVP — the
    // alternative is telling a physician their request failed when it did not.
    // Contact details are deliberately excluded from this log line.
    console.info(
      "[lead] accepted with no sink configured",
      JSON.stringify({
        receivedAt: lead.receivedAt,
        role: lead.role,
        nextStep: lead.nextStep,
        context: lead.context,
      }),
    );
    return { delivered: true, sinks: [], failures: [] };
  }

  const results = await Promise.allSettled(active.map((s) => s.send(lead)));
  const sinks: string[] = [];
  const failures: string[] = [];
  results.forEach((r, i) => {
    const name = active[i]!.name;
    if (r.status === "fulfilled") sinks.push(name);
    else failures.push(name);
  });
  return { delivered: sinks.length > 0, sinks, failures };
}
