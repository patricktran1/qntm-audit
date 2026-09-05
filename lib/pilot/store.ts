import type {
  AuditProgress,
  DiscoveryOutcome,
  PilotSession,
  PilotSummary,
} from "./types";

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

export interface ProbeResult {
  ok: boolean;
  /** Round-trip time for a set → get → delete cycle. */
  latencyMs?: number;
  /** Safe to display. Never contains credentials or URLs. */
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
  /** Appends assumption movements to an existing session. Never creates one. */
  appendAssumptionChanges(
    sessionId: string,
    changes: PilotSession["assumptionChanges"],
  ): Promise<StoreResult>;
  /**
   * Upserts questionnaire progress for a visitor who has not necessarily
   * finished. Monotonic: furthest step only advances, completed only latches.
   */
  putProgress(progress: AuditProgress): Promise<StoreResult>;
  putOutcome(outcome: DiscoveryOutcome): Promise<StoreResult>;
  getOutcome(sessionId: string): Promise<DiscoveryOutcome | null>;
  /** Everything, for the operator dashboard and exports. Newest first. */
  readAll(limit?: number): Promise<PilotSummary>;
  /**
   * Connectivity, write, read, and delete in one round trip, against a probe
   * key that never touches pilot data and is removed before returning.
   */
  probe(): Promise<ProbeResult>;
  /**
   * Deletes every session flagged isTest, and its outcome. Deliberately the
   * only destructive operation the store exposes: it cannot be pointed at a
   * real record, because the predicate is the flag, not an id from a caller.
   */
  deleteTestRecords(): Promise<{ ok: boolean; deleted: number; error?: string }>;
  /** Small operational metadata (last lead test, etc). Never pilot data. */
  putMeta(key: string, value: string): Promise<StoreResult>;
  getMeta(key: string): Promise<string | null>;
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
  async appendAssumptionChanges(): Promise<StoreResult> {
    return { ok: true };
  }
  async putProgress(): Promise<StoreResult> {
    return { ok: true };
  }
  async putOutcome(): Promise<StoreResult> {
    return { ok: false, error: "no pilot store configured" };
  }
  async getOutcome(): Promise<DiscoveryOutcome | null> {
    return null;
  }
  async readAll(): Promise<PilotSummary> {
    return { sessions: [], outcomes: [], progress: [] };
  }
  async probe(): Promise<ProbeResult> {
    return { ok: false, error: "no pilot store configured" };
  }
  async deleteTestRecords(): Promise<{ ok: boolean; deleted: number; error?: string }> {
    return { ok: false, deleted: 0, error: "no pilot store configured" };
  }
  async putMeta(): Promise<StoreResult> {
    return { ok: false, error: "no pilot store configured" };
  }
  async getMeta(): Promise<string | null> {
    return null;
  }
}

// ── Upstash Redis over REST ─────────────────────────────────────────────────

const META_HASH = "qntm:setup:meta";
/** Lifecycle marks, one field per (session, mark). Never read-modify-written. */
const MARK_HASH = "qntm:pilot:marks";
const SESSION_HASH = "qntm:pilot:sessions";
const SESSION_INDEX = "qntm:pilot:session_index";
const OUTCOME_HASH = "qntm:pilot:outcomes";
const OUTCOME_INDEX = "qntm:pilot:outcome_index";
const PROGRESS_HASH = "qntm:pilot:progress";
const PROGRESS_INDEX = "qntm:pilot:progress_index";
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

    // The frozen result may only change when the answers themselves change.
    // The assumption-flush path re-sends the same encoded report; if the
    // model were bumped between completion and flush, recomputing the
    // snapshot would silently rewrite what the physician was actually shown
    // — including its modelVersion. Same answers, same snapshot, forever.
    // A genuinely re-taken audit (different answers) does update, because
    // the physician saw the new report.
    const sameAnswers = incoming.report === existing.report;

    return {
      ...existing,
      ...incoming,
      // First completion wins: a later write is an update, not a new audit.
      completedAt: existing.completedAt,
      firstSeen: existing.firstSeen,
      durationMs: existing.durationMs ?? incoming.durationMs,
      snapshot: sameAnswers ? existing.snapshot : incoming.snapshot,
      // The experiment arm was assigned once; a later write cannot move it.
      variant: existing.variant ?? incoming.variant,
      // Lifecycle flags are set elsewhere and must survive a session rewrite.
      ctaClickedAt: existing.ctaClickedAt ?? incoming.ctaClickedAt,
      leadSubmittedAt: existing.leadSubmittedAt ?? incoming.leadSubmittedAt,
      // Attribution is first-touch; do not let a later write erase it.
      attribution: Object.keys(existing.attribution).length
        ? existing.attribution
        : incoming.attribution,
      // Demo and test are one-way: once flagged, a record can never quietly
      // become real pilot evidence.
      isDemo: existing.isDemo || incoming.isDemo,
      isTest: existing.isTest === true || incoming.isTest === true,
      assumptionChanges: [...byKey.values()],
    };
  }

  /**
   * Lifecycle marks live in their own hash, one field per mark, written with
   * HSETNX — atomic, first-write-wins, and never a read-modify-write.
   *
   * They used to live inside the session blob, which made every mark a
   * read-then-write over the whole record. Clicking the conversion CTA fires
   * the mark and the report's assumption flush in the same instant, so the two
   * writers raced over one key: whichever HSET landed second silently
   * discarded the other's field. With marks in their own field, no two writers
   * ever touch the same key and the race cannot happen at all.
   *
   * A mark is recorded even when the session record itself is absent — a lead
   * can legitimately arrive for a session stored before the store was
   * configured — and readAll() overlays it if the record ever appears.
   */
  async markSession(
    sessionId: string,
    patch: Partial<Pick<PilotSession, "leadSubmittedAt" | "ctaClickedAt">>,
  ): Promise<StoreResult> {
    const commands: string[][] = [];
    if (patch.ctaClickedAt)
      commands.push(["HSETNX", MARK_HASH, `${sessionId}:cta`, patch.ctaClickedAt]);
    if (patch.leadSubmittedAt)
      commands.push(["HSETNX", MARK_HASH, `${sessionId}:lead`, patch.leadSubmittedAt]);
    if (commands.length === 0) return { ok: true };
    try {
      await this.pipeline(commands);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: safeError(e) };
    }
  }

  /**
   * Appends assumption movements to an EXISTING session. Update-only by
   * construction: if the record is absent this is a no-op, not a create.
   *
   * The report a reader is looking at is not necessarily their own — share
   * links are a feature — so a flush that could create a record would mint a
   * phantom "completed audit" for anyone who opened a shared report, inflating
   * the denominator of every ratio the stop conditions are read from. It also
   * never touches the snapshot or the report: the frozen result belongs to the
   * audit that produced it.
   */
  async appendAssumptionChanges(
    sessionId: string,
    changes: PilotSession["assumptionChanges"],
  ): Promise<StoreResult> {
    if (changes.length === 0) return { ok: true };
    try {
      const [raw] = await this.pipeline([["HGET", SESSION_HASH, sessionId]]);
      // No record: nothing to append to. Deliberately not a create.
      if (typeof raw !== "string") return { ok: true };

      let existing: PilotSession;
      try {
        existing = JSON.parse(raw) as PilotSession;
      } catch {
        return { ok: false, error: "corrupt session record" };
      }

      const byKey = new Map(existing.assumptionChanges.map((c) => [c.key, c]));
      for (const c of changes) byKey.set(c.key, c);
      const merged: PilotSession = {
        ...existing,
        assumptionChanges: [...byKey.values()],
      };
      await this.pipeline([
        ["HSET", SESSION_HASH, sessionId, JSON.stringify(merged)],
      ]);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: safeError(e) };
    }
  }

  async putProgress(progress: AuditProgress): Promise<StoreResult> {
    try {
      const merged = await this.mergeProgress(progress);
      await this.pipeline([
        ["HSET", PROGRESS_HASH, progress.sessionId, JSON.stringify(merged)],
        ["LREM", PROGRESS_INDEX, "0", progress.sessionId],
        ["LPUSH", PROGRESS_INDEX, progress.sessionId],
        ["LTRIM", PROGRESS_INDEX, "0", String(MAX_READ - 1)],
      ]);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: safeError(e) };
    }
  }

  /**
   * Progress only ever moves forward. Going back a step, or reloading onto an
   * earlier one, must not make the record claim less than the visitor reached.
   */
  private async mergeProgress(incoming: AuditProgress): Promise<AuditProgress> {
    const [raw] = await this.pipeline([
      ["HGET", PROGRESS_HASH, incoming.sessionId],
    ]);
    if (typeof raw !== "string") return incoming;
    let existing: AuditProgress;
    try {
      existing = JSON.parse(raw) as AuditProgress;
    } catch {
      return incoming;
    }
    const forward = incoming.furthestIndex >= existing.furthestIndex;
    const union = (a: string[], b: string[]) => [...new Set([...a, ...b])];
    return {
      ...existing,
      ...incoming,
      startedAt: existing.startedAt,
      furthestIndex: Math.max(existing.furthestIndex, incoming.furthestIndex),
      furthestStepId: forward ? incoming.furthestStepId : existing.furthestStepId,
      // A field answered once stays answered even if the visitor clears it,
      // because the question we are asking is "did anyone get this far".
      answeredFields: union(existing.answeredFields, incoming.answeredFields),
      unknownFields: union(existing.unknownFields, incoming.unknownFields),
      attribution: Object.keys(existing.attribution).length
        ? existing.attribution
        : incoming.attribution,
      isDemo: existing.isDemo || incoming.isDemo,
      isTest: existing.isTest === true || incoming.isTest === true,
      completed: existing.completed || incoming.completed,
    };
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
      const [sessionIds, outcomeIds, progressIds] = (await this.pipeline([
        ["LRANGE", SESSION_INDEX, "0", String(capped - 1)],
        ["LRANGE", OUTCOME_INDEX, "0", String(capped - 1)],
        ["LRANGE", PROGRESS_INDEX, "0", String(capped - 1)],
      ])) as [string[], string[], string[]];

      const commands: string[][] = [];
      if (sessionIds.length > 0) {
        commands.push(["HMGET", SESSION_HASH, ...sessionIds]);
        // Lifecycle marks live outside the session blob; fetch them alongside.
        commands.push([
          "HMGET",
          MARK_HASH,
          ...sessionIds.flatMap((id) => [`${id}:cta`, `${id}:lead`]),
        ]);
      }
      if (outcomeIds.length > 0) commands.push(["HMGET", OUTCOME_HASH, ...outcomeIds]);
      if (progressIds.length > 0)
        commands.push(["HMGET", PROGRESS_HASH, ...progressIds]);
      if (commands.length === 0) return { sessions: [], outcomes: [], progress: [] };

      const results = await this.pipeline(commands);
      let cursor = 0;
      const sessions =
        sessionIds.length > 0 ? parseList<PilotSession>(results[cursor++]) : [];
      const markValues = sessionIds.length > 0 ? results[cursor++] : null;
      const outcomes =
        outcomeIds.length > 0 ? parseList<DiscoveryOutcome>(results[cursor++]) : [];
      const progress =
        progressIds.length > 0 ? parseList<AuditProgress>(results[cursor++]) : [];

      return {
        sessions: overlayMarks(sessions, sessionIds, markValues),
        outcomes,
        progress,
      };
    } catch {
      // A read failure and a genuinely empty store are indistinguishable to the
      // caller unless we say so. The physician-facing paths still get an empty
      // result and carry on; the operator paths (exports, backup) check this
      // flag rather than shipping a valid-looking empty file.
      return { sessions: [], outcomes: [], progress: [], readFailed: true };
    }
  }

  async probe(): Promise<ProbeResult> {
    // A dedicated key outside the pilot namespace, expiring on its own even
    // if the DEL is never reached, holding a nonce so a stale value from an
    // earlier probe cannot fake a passing read.
    const key = "qntm:setup:probe";
    const nonce = `probe-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const started = Date.now();
    try {
      const results = await this.pipeline([
        ["SET", key, nonce, "EX", "60"],
        ["GET", key],
        ["DEL", key],
      ]);
      const latencyMs = Date.now() - started;
      if (results[1] !== nonce)
        return { ok: false, latencyMs, error: "read returned a different value than written" };
      return { ok: true, latencyMs };
    } catch (e) {
      return { ok: false, error: safeError(e) };
    }
  }

  async deleteTestRecords(): Promise<{ ok: boolean; deleted: number; error?: string }> {
    try {
      const summary = await this.readAll();
      // Never delete on the strength of a failed read: it would report zero
      // and look like a clean store.
      if (summary.readFailed)
        return { ok: false, deleted: 0, error: "could not read the store" };
      // A visitor who quit has a progress row and no session, so test ids must
      // be collected from both or QA abandonments would survive the clear.
      const testIds = [
        ...new Set([
          ...summary.sessions.filter((s) => s.isTest === true).map((s) => s.sessionId),
          ...summary.progress.filter((p) => p.isTest === true).map((p) => p.sessionId),
        ]),
      ];
      if (testIds.length === 0) return { ok: true, deleted: 0 };

      const commands: string[][] = [];
      for (const id of testIds) {
        commands.push(["HDEL", SESSION_HASH, id]);
        commands.push(["LREM", SESSION_INDEX, "0", id]);
        commands.push(["HDEL", OUTCOME_HASH, id]);
        commands.push(["LREM", OUTCOME_INDEX, "0", id]);
        commands.push(["HDEL", MARK_HASH, `${id}:cta`]);
        commands.push(["HDEL", MARK_HASH, `${id}:lead`]);
        commands.push(["HDEL", PROGRESS_HASH, id]);
        commands.push(["LREM", PROGRESS_INDEX, "0", id]);
      }
      await this.pipeline(commands);
      return { ok: true, deleted: testIds.length };
    } catch (e) {
      return { ok: false, deleted: 0, error: safeError(e) };
    }
  }

  async putMeta(key: string, value: string): Promise<StoreResult> {
    try {
      await this.pipeline([["HSET", META_HASH, key, value.slice(0, 2000)]]);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: safeError(e) };
    }
  }

  async getMeta(key: string): Promise<string | null> {
    try {
      const [raw] = await this.pipeline([["HGET", META_HASH, key]]);
      return typeof raw === "string" ? raw : null;
    } catch {
      return null;
    }
  }
}

/**
 * Folds the marks hash back onto the session records. A mark wins only where
 * the record has none, so a value already inside a restored backup is kept.
 */
function overlayMarks(
  sessions: PilotSession[],
  ids: string[],
  raw: unknown,
): PilotSession[] {
  if (!Array.isArray(raw)) return sessions;
  const cta = new Map<string, string>();
  const lead = new Map<string, string>();
  ids.forEach((id, i) => {
    const c = raw[i * 2];
    const l = raw[i * 2 + 1];
    if (typeof c === "string") cta.set(id, c);
    if (typeof l === "string") lead.set(id, l);
  });
  return sessions.map((s) => ({
    ...s,
    ctaClickedAt: s.ctaClickedAt ?? cta.get(s.sessionId) ?? null,
    leadSubmittedAt: s.leadSubmittedAt ?? lead.get(s.sessionId) ?? null,
  }));
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

/**
 * Never leaks a URL or credential into a log line — or, more importantly, into
 * /internal/setup, which renders these strings.
 *
 * Redaction runs BEFORE truncation, and matches any scheme rather than only
 * http(s): pasting the Upstash `redis://default:<password>@host` connection
 * string instead of the REST URL makes fetch throw an error quoting the whole
 * URL, and a truncated-but-unredacted message put 37 characters of that
 * password on the readiness page.
 */
function safeError(e: unknown): string {
  const message = e instanceof Error ? e.message : "unknown";
  return message
    .replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, "[url]")
    .replace(/\S+@\S+/g, "[redacted]")
    .slice(0, 120);
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
