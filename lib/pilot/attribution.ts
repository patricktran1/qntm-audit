/**
 * PILOT IDENTITY AND ATTRIBUTION
 *
 * Two jobs, both of which the previous build was missing entirely:
 *
 *  1. A durable, opaque session id so an outreach visit can be followed through
 *     audit → report → lead → discovery outcome. Without it the pilot cannot
 *     answer "did the practice we met at the conference ever finish?".
 *
 *  2. Sanitised campaign attribution, so we can tell cohorts apart without
 *     building a marketing platform.
 *
 * The session id is deliberately NOT a credential. It grants no read access to
 * anything — every read path is behind the internal gate. It exists so records
 * can be joined, and it must never contain or encode personal data.
 */

/** Attribution fields we accept, in the order they are read from a URL. */
export const ATTRIBUTION_KEYS = ["source", "campaign", "cohort", "ref"] as const;
export type AttributionKey = (typeof ATTRIBUTION_KEYS)[number];

export type Attribution = Partial<Record<AttributionKey, string>>;

/** Where the visitor entered from, as far as we can tell. */
export type EntryMode = "direct" | "demo";

export interface PilotIdentity {
  sessionId: string;
  attribution: Attribution;
  entryMode: EntryMode;
  /** ISO timestamp of first touch in this browser. */
  firstSeen: string;
}

const SESSION_KEY = "qntm.pilot.session";
const ATTRIBUTION_KEY = "qntm.pilot.attribution";
const ENTRY_KEY = "qntm.pilot.entry";
const FIRST_SEEN_KEY = "qntm.pilot.firstSeen";

/**
 * Sanitises one attribution value.
 *
 * Attribution arrives from a URL anyone can craft and ends up in an operator
 * dashboard and a CSV, so it is bounded, lowercased, and reduced to a
 * conservative character set. Anything outside that is dropped rather than
 * escaped — an attribution value has no legitimate reason to contain markup,
 * control characters, or a comma that would break a CSV row.
 */
export function sanitizeAttributionValue(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return cleaned.length > 0 ? cleaned : undefined;
}

/** Reads and sanitises attribution from a query string or URLSearchParams. */
export function readAttribution(
  params: URLSearchParams | Record<string, string | undefined>,
): Attribution {
  const get = (k: string) =>
    params instanceof URLSearchParams ? params.get(k) : params[k];
  const out: Attribution = {};
  for (const key of ATTRIBUTION_KEYS) {
    const value = sanitizeAttributionValue(get(key));
    if (value) out[key] = value;
  }
  return out;
}

/** True when the attribution object carries anything at all. */
export function hasAttribution(a: Attribution): boolean {
  return ATTRIBUTION_KEYS.some((k) => a[k] !== undefined);
}

/** Renders attribution for display and CSV. Stable ordering. */
export function formatAttribution(a: Attribution): string {
  const parts = ATTRIBUTION_KEYS.filter((k) => a[k]).map((k) => `${k}=${a[k]}`);
  return parts.length > 0 ? parts.join(" ") : "—";
}

/**
 * Opaque session id. Random, prefixed for greppability, and containing nothing
 * derived from the visitor. 96 bits of entropy is far more than a 50-practice
 * pilot needs and costs nothing.
 */
export function newSessionId(): string {
  const bytes = new Uint8Array(12);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return `ps_${out}`;
}

/** Shape check for a session id arriving from a client. */
export function isSessionId(value: unknown): value is string {
  return typeof value === "string" && /^ps_[0-9a-f]{24}$/.test(value);
}

// ── Browser-side persistence ────────────────────────────────────────────────
// localStorage rather than sessionStorage: a physician who starts the audit,
// closes the tab, and comes back an hour later is the same pilot participant.

function read(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode or quota. The pilot loses one record; the audit still works.
  }
}

/**
 * Captures attribution and entry mode on first touch. Later visits do not
 * overwrite an existing attribution — first touch wins, so a physician who
 * arrives from a conference link and returns directly still counts to that
 * cohort.
 */
export function captureEntry(
  params: URLSearchParams,
  entryMode: EntryMode = "direct",
): void {
  if (typeof window === "undefined") return;

  const incoming = readAttribution(params);
  if (hasAttribution(incoming) && !read(ATTRIBUTION_KEY)) {
    write(ATTRIBUTION_KEY, JSON.stringify(incoming));
  }
  if (!read(ENTRY_KEY)) write(ENTRY_KEY, entryMode);
  // A demo entry is always recorded, even on a return visit, because demo
  // traffic must never be mistaken for a self-directed audit.
  if (entryMode === "demo") write(ENTRY_KEY, "demo");
  if (!read(FIRST_SEEN_KEY)) write(FIRST_SEEN_KEY, new Date().toISOString());
}

/** Returns the durable identity, creating the session id on first call. */
export function pilotIdentity(): PilotIdentity {
  const existing = read(SESSION_KEY);
  const sessionId = isSessionId(existing) ? existing : newSessionId();
  if (sessionId !== existing) write(SESSION_KEY, sessionId);

  let attribution: Attribution = {};
  const stored = read(ATTRIBUTION_KEY);
  if (stored) {
    try {
      attribution = readAttribution(JSON.parse(stored) as Record<string, string>);
    } catch {
      attribution = {};
    }
  }

  const entry = read(ENTRY_KEY);
  return {
    sessionId,
    attribution,
    entryMode: entry === "demo" ? "demo" : "direct",
    firstSeen: read(FIRST_SEEN_KEY) ?? new Date().toISOString(),
  };
}

/** Clears pilot identity. Used by the demo reset so a booth device stays clean. */
export function resetPilotIdentity(): void {
  if (typeof window === "undefined") return;
  for (const key of [SESSION_KEY, ATTRIBUTION_KEY, ENTRY_KEY, FIRST_SEEN_KEY]) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Nothing to do.
    }
  }
}
