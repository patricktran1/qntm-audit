import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAudit } from "@/lib/engine/audit";
import { PRACTICE_FIXTURES } from "@/lib/engine/fixtures";
import { newSessionId } from "@/lib/pilot/attribution";
import { isRealSession, pilotHealth } from "@/lib/pilot/analyse";
import { sessionsCsv, SESSION_COLUMNS } from "@/lib/pilot/export";
import { buildSnapshot } from "@/lib/pilot/snapshot";
import { RedisStore, __resetPilotStore } from "@/lib/pilot/store";
import type { DiscoveryOutcome, PilotSession } from "@/lib/pilot/types";
import { encodeAnswers } from "@/lib/share";

/**
 * WORKFLOW INTEGRITY
 *
 * The pilot now spans multiple writes over time: completion, assumption
 * flushes, CTA marks, lead marks, discovery outcomes, deletions. Each of
 * these tests pins one way that sequence could corrupt the dataset. They run
 * against the real RedisStore over an in-memory fake of the Upstash REST
 * pipeline, so the merge logic under test is the production code path.
 */

// ── In-memory Upstash fake ─────────────────────────────────────────────────

class FakeRedis {
  hashes = new Map<string, Map<string, string>>();
  lists = new Map<string, string[]>();
  strings = new Map<string, string>();
  /** When set, every pipeline call fails like a network outage. */
  down = false;

  exec(cmd: string[]): unknown {
    const [op, ...args] = cmd;
    switch (op) {
      case "HSET": {
        const [key, field, value] = args as [string, string, string];
        if (!this.hashes.has(key)) this.hashes.set(key, new Map());
        this.hashes.get(key)!.set(field, value);
        return 1;
      }
      case "HGET": {
        const [key, field] = args as [string, string];
        return this.hashes.get(key)?.get(field) ?? null;
      }
      case "HSETNX": {
        const [key, field, value] = args as [string, string, string];
        if (!this.hashes.has(key)) this.hashes.set(key, new Map());
        const h = this.hashes.get(key)!;
        if (h.has(field)) return 0;
        h.set(field, value);
        return 1;
      }
      case "HDEL": {
        const [key, field] = args as [string, string];
        return this.hashes.get(key)?.delete(field) ? 1 : 0;
      }
      case "HMGET": {
        const [key, ...fields] = args as [string, ...string[]];
        return fields.map((f) => this.hashes.get(key)?.get(f) ?? null);
      }
      case "LPUSH": {
        const [key, value] = args as [string, string];
        const list = this.lists.get(key) ?? [];
        list.unshift(value);
        this.lists.set(key, list);
        return list.length;
      }
      case "LREM": {
        const [key, , value] = args as [string, string, string];
        const list = this.lists.get(key) ?? [];
        const kept = list.filter((v) => v !== value);
        this.lists.set(key, kept);
        return list.length - kept.length;
      }
      case "LTRIM": {
        const [key, start, stop] = args as [string, string, string];
        const list = this.lists.get(key) ?? [];
        this.lists.set(key, list.slice(Number(start), Number(stop) + 1));
        return "OK";
      }
      case "LRANGE": {
        const [key, start, stop] = args as [string, string, string];
        const list = this.lists.get(key) ?? [];
        return list.slice(Number(start), Number(stop) + 1);
      }
      case "SET": {
        const [key, value] = args as [string, string];
        this.strings.set(key, value);
        return "OK";
      }
      case "GET": {
        return this.strings.get(args[0] as string) ?? null;
      }
      case "DEL": {
        return this.strings.delete(args[0] as string) ? 1 : 0;
      }
      default:
        throw new Error(`fake redis: unhandled ${op}`);
    }
  }

  handle(commands: string[][]): { result?: unknown; error?: string }[] {
    return commands.map((c) => {
      try {
        return { result: this.exec(c) };
      } catch (e) {
        return { error: (e as Error).message };
      }
    });
  }
}

let fake: FakeRedis;
const KV_URL = "http://fake-kv.test";
const realFetch = globalThis.fetch;

/** Per-test hooks for non-KV destinations (lead sinks). */
let sinkHandler: ((url: string) => Response) | null = null;

beforeEach(() => {
  fake = new FakeRedis();
  sinkHandler = null;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith(KV_URL)) {
      if (fake.down) throw new TypeError("fetch failed");
      const commands = JSON.parse(String(init?.body)) as string[][];
      return new Response(JSON.stringify(fake.handle(commands)), {
        headers: { "content-type": "application/json" },
      });
    }
    if (sinkHandler) return sinkHandler(url);
    throw new Error(`unexpected fetch in test: ${url}`);
  });
});

afterEach(() => {
  vi.stubGlobal("fetch", realFetch);
  __resetPilotStore();
  delete process.env.PILOT_KV_REST_URL;
  delete process.env.PILOT_KV_REST_TOKEN;
  delete process.env.LEAD_SLACK_WEBHOOK_URL;
});

function store(): RedisStore {
  return new RedisStore(KV_URL, "test-token");
}

function sessionFrom(
  fixtureId: string,
  overrides: Partial<PilotSession> = {},
): PilotSession {
  const fixture = PRACTICE_FIXTURES.find((f) => f.id === fixtureId)!;
  const result = runAudit(fixture.answers);
  return {
    sessionId: newSessionId(),
    completedAt: "2026-08-29T10:00:00.000Z",
    firstSeen: "2026-08-29T09:50:00.000Z",
    variant: "A",
    attribution: { source: "personal", campaign: "founder_pilot", cohort: "first10" },
    entryMode: "direct",
    isDemo: false,
    isTest: false,
    durationMs: 240_000,
    snapshot: buildSnapshot(result),
    assumptionChanges: [],
    leadSubmittedAt: null,
    ctaClickedAt: null,
    report: encodeAnswers(fixture.answers),
    ...overrides,
  };
}

function outcomeFor(sessionId: string, overrides: Partial<DiscoveryOutcome> = {}): DiscoveryOutcome {
  return {
    sessionId,
    recordedAt: "2026-08-30T10:00:00.000Z",
    modelVersion: "1.1.0",
    callOutcome: "spoke",
    auditAccuracy: "confirmed",
    actualPain: "PATIENT ACCESS",
    economicReaction: "credible",
    mostChallengedAssumption: "",
    whyBuy: "",
    whyNotBuy: "",
    serviceRelevant: "AI phone agent / inbound triage",
    nextAction: "second_call",
    nextActionNote: "",
    ...overrides,
  };
}

async function stored(s: RedisStore, id: string): Promise<PilotSession> {
  const { sessions } = await s.readAll();
  const found = sessions.find((row) => row.sessionId === id);
  expect(found, `session ${id} should exist`).toBeDefined();
  return found!;
}

// ── First-touch attribution ────────────────────────────────────────────────

describe("first-touch attribution is immutable", () => {
  it("a later write with different attribution does not overwrite the first", async () => {
    const s = store();
    const session = sessionFrom("phone-bottleneck");
    await s.putSession(session);
    await s.putSession({
      ...session,
      attribution: { source: "hijacked", campaign: "other" },
    });
    const after = await stored(s, session.sessionId);
    expect(after.attribution).toEqual(session.attribution);
  });

  it("a first write with no attribution can be enriched once, then locks", async () => {
    const s = store();
    const session = sessionFrom("phone-bottleneck", { attribution: {} });
    await s.putSession(session);
    await s.putSession({ ...session, attribution: { source: "leaderm" } });
    await s.putSession({ ...session, attribution: { source: "someone-else" } });
    const after = await stored(s, session.sessionId);
    expect(after.attribution).toEqual({ source: "leaderm" });
  });
});

// ── Demo and test flags are one-way ────────────────────────────────────────

describe("demo and test flags are one-way", () => {
  it("a demo session can never become real pilot data", async () => {
    const s = store();
    const session = sessionFrom("phone-bottleneck", { isDemo: true });
    await s.putSession(session);
    await s.putSession({ ...session, isDemo: false });
    const after = await stored(s, session.sessionId);
    expect(after.isDemo).toBe(true);
    expect(isRealSession(after)).toBe(false);
  });

  it("a test session can never become real pilot data", async () => {
    const s = store();
    const session = sessionFrom("phone-bottleneck", { isTest: true });
    await s.putSession(session);
    await s.putSession({ ...session, isTest: false });
    const after = await stored(s, session.sessionId);
    expect(after.isTest).toBe(true);
    expect(isRealSession(after)).toBe(false);
  });

  it("records that predate the isTest field still count as real", () => {
    const legacy = sessionFrom("phone-bottleneck");
    // Simulate a 1.1.0-era record parsed from storage without the field.
    delete (legacy as Partial<PilotSession>).isTest;
    expect(isRealSession(legacy)).toBe(true);
  });
});

// ── Lifecycle marks survive later writes ───────────────────────────────────

describe("lifecycle state survives every later write", () => {
  it("an assumption flush cannot erase CTA state, lead state, or duration", async () => {
    const s = store();
    const session = sessionFrom("phone-bottleneck");
    await s.putSession(session);
    await s.markSession(session.sessionId, {
      ctaClickedAt: "2026-08-29T10:05:00.000Z",
      leadSubmittedAt: "2026-08-29T10:06:00.000Z",
    });

    // The flush write carries null duration and no lifecycle state — exactly
    // what lib/pilot/client.ts sends when the reader leaves the report.
    await s.putSession({
      ...session,
      durationMs: null,
      assumptionChanges: [
        { key: "callHandleMinutes", from: 4, to: 6, direction: "up" },
      ],
    });

    const after = await stored(s, session.sessionId);
    expect(after.ctaClickedAt).toBe("2026-08-29T10:05:00.000Z");
    expect(after.leadSubmittedAt).toBe("2026-08-29T10:06:00.000Z");
    expect(after.durationMs).toBe(240_000);
    expect(after.assumptionChanges).toHaveLength(1);
  });

  it("a lead mark cannot erase completion facts", async () => {
    const s = store();
    const session = sessionFrom("revenue-cycle-problem");
    await s.putSession(session);
    await s.markSession(session.sessionId, {
      leadSubmittedAt: "2026-08-29T11:00:00.000Z",
    });
    const after = await stored(s, session.sessionId);
    expect(after.completedAt).toBe(session.completedAt);
    expect(after.snapshot).toEqual(session.snapshot);
    expect(after.report).toBe(session.report);
  });

  it("assumption changes accumulate by key across writes", async () => {
    const s = store();
    const session = sessionFrom("phone-bottleneck", {
      assumptionChanges: [
        { key: "callHandleMinutes", from: 4, to: 5, direction: "up" },
      ],
    });
    await s.putSession(session);
    await s.putSession({
      ...session,
      assumptionChanges: [
        { key: "callHandleMinutes", from: 5, to: 6, direction: "up" },
        { key: "frontOfficeLoadedHourlyCost", from: 22, to: 20, direction: "down" },
      ],
    });
    const after = await stored(s, session.sessionId);
    expect(after.assumptionChanges).toHaveLength(2);
    expect(
      after.assumptionChanges.find((c) => c.key === "callHandleMinutes")?.to,
    ).toBe(6);
  });
});

// ── The frozen snapshot ────────────────────────────────────────────────────

describe("the stored result cannot change retroactively", () => {
  it("re-sending the same answers keeps the original snapshot byte for byte", async () => {
    const s = store();
    const session = sessionFrom("phone-bottleneck");
    await s.putSession(session);

    // Simulate a model bump between completion and the assumption flush: the
    // flush recomputes the snapshot under the "new model". Same answers, so
    // the original must win — including its modelVersion.
    const tampered = {
      ...session.snapshot,
      modelVersion: "9.9.9",
      score: 1,
      verdict: "act" as const,
    };
    await s.putSession({ ...session, snapshot: tampered });

    const after = await stored(s, session.sessionId);
    expect(after.snapshot).toEqual(session.snapshot);
    expect(after.snapshot.modelVersion).not.toBe("9.9.9");
  });

  it("genuinely different answers do update the snapshot, keeping first-completion facts", async () => {
    const s = store();
    const first = sessionFrom("phone-bottleneck");
    await s.putSession(first);

    const other = PRACTICE_FIXTURES.find((f) => f.id === "healthy-group")!;
    const rerun = runAudit(other.answers);
    await s.putSession({
      ...first,
      report: encodeAnswers(other.answers),
      snapshot: buildSnapshot(rerun),
      completedAt: "2026-09-01T00:00:00.000Z",
      firstSeen: "2026-09-01T00:00:00.000Z",
    });

    const after = await stored(s, first.sessionId);
    expect(after.snapshot.verdict).toBe(rerun.verdict.level);
    // The first completion timestamps stand: it is an update, not a new audit.
    expect(after.completedAt).toBe(first.completedAt);
    expect(after.firstSeen).toBe(first.firstSeen);
  });

  it("the experiment arm cannot move once assigned", async () => {
    const s = store();
    const session = sessionFrom("phone-bottleneck", { variant: "A" });
    await s.putSession(session);
    await s.putSession({ ...session, variant: "B" });
    const after = await stored(s, session.sessionId);
    expect(after.variant).toBe("A");
  });
});

// ── Outcomes ───────────────────────────────────────────────────────────────

describe("discovery outcomes", () => {
  it("recording an outcome does not alter the source audit record", async () => {
    const s = store();
    const session = sessionFrom("phone-bottleneck");
    await s.putSession(session);
    const before = await stored(s, session.sessionId);

    await s.putOutcome(outcomeFor(session.sessionId, { auditAccuracy: "incorrect" }));

    const after = await stored(s, session.sessionId);
    expect(after).toEqual(before);
  });

  it("an outcome can be edited deliberately, replacing the previous one", async () => {
    const s = store();
    const session = sessionFrom("phone-bottleneck");
    await s.putSession(session);
    await s.putOutcome(outcomeFor(session.sessionId, { auditAccuracy: "confirmed" }));
    await s.putOutcome(outcomeFor(session.sessionId, { auditAccuracy: "incorrect" }));

    const outcome = await s.getOutcome(session.sessionId);
    expect(outcome?.auditAccuracy).toBe("incorrect");
    const { outcomes } = await s.readAll();
    expect(outcomes.filter((o) => o.sessionId === session.sessionId)).toHaveLength(1);
  });
});

// ── Test-record deletion ───────────────────────────────────────────────────

describe("test-record deletion is scoped by the flag", () => {
  it("removes test sessions and their outcomes, and nothing else", async () => {
    const s = store();
    const real = sessionFrom("phone-bottleneck");
    const demo = sessionFrom("healthy-group", { isDemo: true });
    const test1 = sessionFrom("revenue-cycle-problem", { isTest: true });
    const test2 = sessionFrom("high-overhead", { isTest: true, isDemo: true });
    for (const row of [real, demo, test1, test2]) await s.putSession(row);
    await s.putOutcome(outcomeFor(real.sessionId));
    await s.putOutcome(outcomeFor(test1.sessionId));

    const result = await s.deleteTestRecords();
    expect(result.ok).toBe(true);
    expect(result.deleted).toBe(2);

    const { sessions, outcomes } = await s.readAll();
    const ids = sessions.map((row) => row.sessionId);
    expect(ids).toContain(real.sessionId);
    expect(ids).toContain(demo.sessionId);
    expect(ids).not.toContain(test1.sessionId);
    expect(ids).not.toContain(test2.sessionId);
    expect(outcomes.map((o) => o.sessionId)).toEqual([real.sessionId]);
  });

  it("is a no-op when nothing is flagged", async () => {
    const s = store();
    await s.putSession(sessionFrom("phone-bottleneck"));
    const result = await s.deleteTestRecords();
    expect(result).toEqual({ ok: true, deleted: 0 });
  });
});

// ── Failure honesty ────────────────────────────────────────────────────────

describe("storage failure is never reported as success", () => {
  it("putSession and putOutcome return ok:false when Redis is unreachable", async () => {
    const s = store();
    fake.down = true;
    expect((await s.putSession(sessionFrom("phone-bottleneck"))).ok).toBe(false);
    expect((await s.putOutcome(outcomeFor(newSessionId()))).ok).toBe(false);
  });

  it("the probe reports failure with no credentials in the message", async () => {
    const s = store();
    fake.down = true;
    const probe = await s.probe();
    expect(probe.ok).toBe(false);
    expect(probe.error ?? "").not.toContain(KV_URL);
    expect(probe.error ?? "").not.toContain("test-token");
  });

  it("the probe passes a healthy round trip and cleans up after itself", async () => {
    const s = store();
    const probe = await s.probe();
    expect(probe.ok).toBe(true);
    expect(probe.latencyMs).toBeGreaterThanOrEqual(0);
    expect(fake.strings.has("qntm:setup:probe")).toBe(false);
  });

  it("a corrupt stored row is skipped, not fatal to the dashboard", async () => {
    const s = store();
    const good = sessionFrom("phone-bottleneck");
    await s.putSession(good);
    fake.hashes.get("qntm:pilot:sessions")!.set("ps_bad", "{not json");
    fake.lists.get("qntm:pilot:session_index")!.unshift("ps_bad");
    const { sessions } = await s.readAll();
    expect(sessions.map((row) => row.sessionId)).toEqual([good.sessionId]);
  });
});

// ── Lead route ordering ────────────────────────────────────────────────────

describe("lead delivery failure does not erase the persisted lead mark", () => {
  it("marks the session before attempting delivery, so a sink outage loses nothing", async () => {
    process.env.PILOT_KV_REST_URL = KV_URL;
    process.env.PILOT_KV_REST_TOKEN = "test-token";
    process.env.LEAD_SLACK_WEBHOOK_URL = "https://hooks.slack.test/broken";
    __resetPilotStore();
    const { resetRateLimits } = await import("@/lib/rate-limit");
    resetRateLimits();

    // The sink is down; the KV is up.
    sinkHandler = () => new Response("no", { status: 500 });

    const s = store();
    const session = sessionFrom("phone-bottleneck");
    await s.putSession(session);

    const { POST } = await import("@/app/api/lead/route");
    const response = await POST(
      new Request("https://x/api/lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Dr Example",
          email: "doc@example.com",
          practiceName: "Example Dermatology",
          role: "owner_physician",
          location: "",
          website: "",
          concern: "",
          nextStep: "call",
          consent: true,
          report: session.report,
          sessionId: session.sessionId,
          attribution: session.attribution,
          entryMode: "direct",
        }),
      }),
    );

    // Every configured sink failed, so the physician is told the truth…
    expect(response.status).toBe(502);
    // …but the pilot record still knows the lead happened.
    const after = await stored(s, session.sessionId);
    expect(after.leadSubmittedAt).not.toBeNull();
  });
});

// ── Export reconciliation ──────────────────────────────────────────────────

describe("exports reconcile with the dashboard", () => {
  it("the default export's rows equal the dashboard's completed-audit count", () => {
    const rows = [
      sessionFrom("phone-bottleneck"),
      sessionFrom("revenue-cycle-problem"),
      sessionFrom("healthy-group", { isDemo: true }),
      sessionFrom("high-overhead", { isTest: true }),
    ];
    const real = rows.filter(isRealSession);
    const health = pilotHealth(rows);
    expect(real.length).toBe(health.completedAudits);

    const csv = sessionsCsv(real);
    const lines = csv.trim().split("\r\n");
    expect(lines.length - 1).toBe(health.completedAudits);
  });

  it("the is_test column exists and default-scope rows are all false", () => {
    expect(SESSION_COLUMNS).toContain("is_test");
    const rows = [
      sessionFrom("phone-bottleneck"),
      sessionFrom("high-overhead", { isTest: true }),
    ].filter(isRealSession);
    const csv = sessionsCsv(rows);
    const lines = csv.trim().split("\r\n");
    const testIdx = SESSION_COLUMNS.indexOf("is_test");
    for (const line of lines.slice(1)) {
      const cells = line.split('","');
      expect(cells[testIdx]).toContain("false");
    }
  });
});

// ── Regressions from the launch-readiness audit ────────────────────────────
// Each of these failed against 9b72a22. They are the defects an adversarial
// review of that commit found, pinned so they cannot come back.

describe("a flush can never create or rewrite a session", () => {
  it("does not create a record for a report the store has never seen", async () => {
    const s = store();
    const orphan = newSessionId();
    const result = await s.appendAssumptionChanges(orphan, [
      { key: "callHandleMinutes", from: 4, to: 6, direction: "up" },
    ]);
    // Reported as fine — there was simply nothing to append to.
    expect(result.ok).toBe(true);
    const { sessions } = await s.readAll();
    // The critical part: no phantom "completed audit" was minted. Share links
    // are a feature, so a reader leaving someone else's report used to create
    // a record here and inflate the denominator of every published ratio.
    expect(sessions).toHaveLength(0);
  });

  it("never replaces the frozen snapshot or the report, whatever it is handed", async () => {
    const s = store();
    const mine = sessionFrom("phone-bottleneck");
    await s.putSession(mine);

    // The reader opens a colleague's shared report and moves a slider there.
    await s.appendAssumptionChanges(mine.sessionId, [
      { key: "callHandleMinutes", from: 4, to: 7, direction: "up" },
    ]);

    const after = await stored(s, mine.sessionId);
    expect(after.snapshot).toEqual(mine.snapshot);
    expect(after.report).toBe(mine.report);
    expect(after.completedAt).toBe(mine.completedAt);
    expect(after.assumptionChanges).toHaveLength(1);
  });
});

describe("lifecycle marks are atomic", () => {
  it("a CTA mark and a concurrent session write cannot erase each other", async () => {
    const s = store();
    const session = sessionFrom("phone-bottleneck");
    await s.putSession(session);

    // The exact shape of the race: clicking the CTA fires the mark and, as the
    // report unmounts, a session write — both in flight at once. Interleave
    // them so each reads before the other writes.
    await Promise.all([
      s.markSession(session.sessionId, { ctaClickedAt: "2026-08-29T10:05:00.000Z" }),
      s.putSession({ ...session, durationMs: null }),
    ]);

    const after = await stored(s, session.sessionId);
    expect(after.ctaClickedAt).toBe("2026-08-29T10:05:00.000Z");
    expect(after.durationMs).toBe(240_000);
  });

  it("keeps the first mark when the same one is written twice", async () => {
    const s = store();
    const session = sessionFrom("phone-bottleneck");
    await s.putSession(session);
    await s.markSession(session.sessionId, { ctaClickedAt: "2026-08-29T10:05:00.000Z" });
    await s.markSession(session.sessionId, { ctaClickedAt: "2026-08-29T11:00:00.000Z" });
    expect((await stored(s, session.sessionId)).ctaClickedAt).toBe(
      "2026-08-29T10:05:00.000Z",
    );
  });

  it("a mark that arrives before the session record is not lost", async () => {
    const s = store();
    const session = sessionFrom("phone-bottleneck");
    await s.markSession(session.sessionId, {
      leadSubmittedAt: "2026-08-29T10:06:00.000Z",
    });
    await s.putSession(session);
    expect((await stored(s, session.sessionId)).leadSubmittedAt).toBe(
      "2026-08-29T10:06:00.000Z",
    );
  });

  it("clearing test records removes their marks too", async () => {
    const s = store();
    const test = sessionFrom("phone-bottleneck", { isTest: true });
    await s.putSession(test);
    await s.markSession(test.sessionId, { ctaClickedAt: "2026-08-29T10:05:00.000Z" });
    await s.deleteTestRecords();
    // Re-create a session with the same id: no ghost mark may attach to it.
    const reused = sessionFrom("healthy-group", { sessionId: test.sessionId });
    await s.putSession(reused);
    expect((await stored(s, reused.sessionId)).ctaClickedAt).toBeNull();
  });
});

describe("a failed read is never silently an empty store", () => {
  it("flags readFailed rather than returning a clean empty result", async () => {
    const s = store();
    await s.putSession(sessionFrom("phone-bottleneck"));
    fake.down = true;
    const summary = await s.readAll();
    expect(summary.sessions).toHaveLength(0);
    expect(summary.readFailed).toBe(true);
  });

  it("a genuinely empty store is not flagged", async () => {
    expect((await store().readAll()).readFailed).toBeUndefined();
  });

  it("refuses to delete test records on the strength of a failed read", async () => {
    const s = store();
    fake.down = true;
    const result = await s.deleteTestRecords();
    expect(result.ok).toBe(false);
    expect(result.deleted).toBe(0);
  });
});

describe("safeError redacts credentials in any URL scheme", () => {
  it("does not leak a redis:// password into a rendered error", async () => {
    const s = new RedisStore("redis://default:s3cr3tpassword@host.upstash.io:6379", "t");
    // fetch rejects a URL carrying credentials, quoting the whole URL back.
    const probe = await s.probe();
    expect(probe.ok).toBe(false);
    expect(probe.error ?? "").not.toContain("s3cr3tpassword");
    expect(probe.error ?? "").not.toContain("redis://");
  });
});
