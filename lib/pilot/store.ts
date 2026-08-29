import type { DiscoveryOutcome, PilotSession, PilotSummary } from "./types";

/**
 * PILOT PERSISTENCE
 *
 * One interface, two implementations:
 *
 *   noop   — the default. The product works completely without persistence;
 *            the pilot simply learns nothing. This is what production runs
 *            until credentials are configured.
 *   redis  — Upstash Redis over its REST API.
 *
 * Why Upstash REST rather than a database:
 *   - Two environment variables and `fetch`. No SDK, no new dependency, no
 *     connection pooling problem on serverless.
 *   - A 50-practice pilot is a few hundred kilobytes. A relational schema
 *     would be ceremony around a hash and two lists.
 *   - Swapping it later means writing one more implementation of this
 *     interface, which is exactly what the interface is for.
 *
 * Nothing here throws at the caller. A pilot-storage failure must never break
 * a physician's audit or lose their lead submission, so every method returns a
 * result the caller can log and move past.
 */

export interface StoreResult {
  ok: boolean;
  /** Safe to log. Never contains credentials or user data. */
  error?: string;
}

export interface PilotStore {
  readonly kind: "noop" | "redis";
  readonly configured: boolean;
  /** Upserts a session. Later writes merge over earlier ones. */
  putSession(session: PilotSession): Promise<StoreResult>;
  /** Marks a lifecycle moment without rewriting the whole record. */
  markSession(
    sessionId: string,
    patch: Partial<Pick<PilotSession, "leadSubmittedAt" | "ctaClickedAt">>,
  ): Promise<StoreResult>;
  putOutcome(outcome: DiscoveryOutcome): Promise<StoreResult>;
  getOutcome(sessionId: string): Promise<DiscoveryOutcome | null>;
  /** Everything, for the operator dashboard and exports. Newest first. */
  readAll(limit?: number): Promise<PilotSummary>;
}

// ── No-op ───────────────────────────────────────────────────────────────────

class NoopStore implements PilotStore {
  readonly kind = "noop" as const;
  readonly configured = false;

  async putSession(): Promise<StoreResult> {
    return { ok: true };
  }
  async markSession(): Promise<StoreResult> {
    return { ok: true };
  }
  async putOutcome(): Promise<StoreResult> {
    return { ok: false, error: "no pilot store configured" };
  }
  async getOutcome(): Promise<DiscoveryOutcome | null> {
    return null;
  }
  async readAll(): Promise<PilotSummary> {
    return { sessions: [], outcomes: [] };
  }
}

// ── Upstash Redis over REST ─────────────────────────────────────────────────

const SESSION_HASH = "qntm:pilot:sessions";
const SESSION_INDEX = "qntm:pilot:session_index";
const OUTCOME_HASH = "qntm:pilot:outcomes";
const OUTCOME_INDEX = "qntm:pilot:outcome_index";
const TIMEOUT_MS = 6000;
/** Hard ceiling so a runaway index cannot pull an unbounded payload. */
const MAX_READ = 2000;

class RedisStore implements PilotStore {
  readonly kind = "redis" as const;
  readonly configured = true;

  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  /** Runs a pipeline of Redis commands. Returns raw results in order. */
  private async pipeline(commands: string[][]): Promise<unknown[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${this.url}/pipeline`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(commands),
        signal: controller.signal,
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`upstash ${res.status}`);
      const body = (await res.json()) as { result?: unknown; error?: string }[];
      return body.map((r) => {
        if (r.error) throw new Error("upstash command error");
        return r.result;
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async putSession(session: PilotSession): Promise<StoreResult> {
    try {
      // Merge rather than overwrite. A session is written more than once — at
      // completion, and again when the reader leaves the report carrying their
      // assumption changes. A blind upsert clobbered the earlier record, which
      // is why duration and CTA state were disappearing from the dashboard.
      const merged = await this.mergeSession(session);
      await this.pipeline([
        ["HSET", SESSION_HASH, session.sessionId, JSON.stringify(merged)],
        // LPUSH then LREM keeps the newest write at the head without
        // duplicating an id that is written more than once.
        ["LREM", SESSION_INDEX, "0", session.sessionId],
        ["LPUSH", SESSION_INDEX, session.sessionId],
        ["LTRIM", SESSION_INDEX, "0", String(MAX_READ - 1)],
      ]);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: safeError(e) };
    }
  }

  /**
   * Later writes may only add. Lifecycle timestamps and the completion facts
   * are preserved once set, and assumption changes accumulate by key.
   */
  private async mergeSession(incoming: PilotSession): Promise<PilotSession> {
    const [raw] = await this.pipeline([
      ["HGET", SESSION_HASH, incoming.sessionId],
    ]);
    if (typeof raw !== "string") return incoming;

    let existing: PilotSession;
    try {
      existing = JSON.parse(raw) as PilotSession;
    } catch {
      return incoming;
    }

    const byKey = new Map(existing.assumptionChanges.map((c) => [c.key, c]));
    for (const c of incoming.assumptionChanges) byKey.set(c.key, c);

    return {
      ...existing,
      ...incoming,
      // First completion wins: a later write is an update, not a new audit.
      completedAt: existing.completedAt,
      firstSeen: existing.firstSeen,
      durationMs: existing.durationMs ?? incoming.durationMs,
      // Lifecycle flags are set elsewhere and must survive a session rewrite.
      ctaClickedAt: existing.ctaClickedAt ?? incoming.ctaClickedAt,
      leadSubmittedAt: existing.leadSubmittedAt ?? incoming.leadSubmittedAt,
      // Attribution is first-touch; do not let a later write erase it.
      attribution: Object.keys(existing.attribution).length
        ? existing.attribution
        : incoming.attribution,
      isDemo: existing.isDemo || incoming.isDemo,
      assumptionChanges: [...byKey.values()],
    };
  }

  async markSession(
    sessionId: string,
    patch: Partial<Pick<PilotSession, "leadSubmittedAt" | "ctaClickedAt">>,
  ): Promise<StoreResult> {
    try {
      const [raw] = await this.pipeline([["HGET", SESSION_HASH, sessionId]]);
      if (typeof raw !== "string") {
        // A lead can legitimately arrive for a session we never stored, for
        // example if storage was configured mid-pilot. Not an error.
        return { ok: true };
      }
      const session = JSON.parse(raw) as PilotSession;
      const merged: PilotSession = { ...session, ...patch };
      await this.pipeline([
        ["HSET", SESSION_HASH, sessionId, JSON.stringify(merged)],
      ]);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: safeError(e) };
    }
  }

  async putOutcome(outcome: DiscoveryOutcome): Promise<StoreResult> {
    try {
      await this.pipeline([
        ["HSET", OUTCOME_HASH, outcome.sessionId, JSON.stringify(outcome)],
        ["LREM", OUTCOME_INDEX, "0", outcome.sessionId],
        ["LPUSH", OUTCOME_INDEX, outcome.sessionId],
        ["LTRIM", OUTCOME_INDEX, "0", String(MAX_READ - 1)],
      ]);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: safeError(e) };
    }
  }

  async getOutcome(sessionId: string): Promise<DiscoveryOutcome | null> {
    try {
      const [raw] = await this.pipeline([["HGET", OUTCOME_HASH, sessionId]]);
      return typeof raw === "string" ? (JSON.parse(raw) as DiscoveryOutcome) : null;
    } catch {
      return null;
    }
  }

  async readAll(limit = MAX_READ): Promise<PilotSummary> {
    const capped = Math.min(Math.max(1, limit), MAX_READ);
    try {
      const [sessionIds, outcomeIds] = (await this.pipeline([
        ["LRANGE", SESSION_INDEX, "0", String(capped - 1)],
        ["LRANGE", OUTCOME_INDEX, "0", String(capped - 1)],
      ])) as [string[], string[]];

      const commands: string[][] = [];
      if (sessionIds.length > 0) commands.push(["HMGET", SESSION_HASH, ...sessionIds]);
      if (outcomeIds.length > 0) commands.push(["HMGET", OUTCOME_HASH, ...outcomeIds]);
      if (commands.length === 0) return { sessions: [], outcomes: [] };

      const results = await this.pipeline(commands);
      let cursor = 0;
      const sessions =
        sessionIds.length > 0 ? parseList<PilotSession>(results[cursor++]) : [];
      const outcomes =
        outcomeIds.length > 0 ? parseList<DiscoveryOutcome>(results[cursor++]) : [];
      return { sessions, outcomes };
    } catch {
      return { sessions: [], outcomes: [] };
    }
  }
}

function parseList<T>(raw: unknown): T[] {
  if (!Array.isArray(raw)) return [];
  const out: T[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    try {
      out.push(JSON.parse(item) as T);
    } catch {
      // A corrupt row is skipped rather than failing the whole dashboard.
    }
  }
  return out;
}

/** Never leaks a URL or token into a log line. */
function safeError(e: unknown): string {
  const message = e instanceof Error ? e.message : "unknown";
  return message.slice(0, 120).replace(/https?:\/\/\S+/g, "[url]");
}

// ── Selection ───────────────────────────────────────────────────────────────

let cached: PilotStore | null = null;

/**
 * Returns the configured store, or the no-op. Cached per process because the
 * environment cannot change under a running instance.
 */
export function pilotStore(): PilotStore {
  if (cached) return cached;
  const url = process.env.PILOT_KV_REST_URL;
  const token = process.env.PILOT_KV_REST_TOKEN;
  cached =
    url && token ? new RedisStore(url.replace(/\/$/, ""), token) : new NoopStore();
  return cached;
}

/** Test seam. */
export function __resetPilotStore(): void {
  cached = null;
}

export { NoopStore, RedisStore };
