/**
 * In-memory fixed-window rate limiter.
 *
 * Scoped to a single server instance, which on a serverless platform means it
 * limits per warm instance rather than globally. That is genuinely useful
 * against casual abuse and scripted floods, and genuinely useless against a
 * distributed attacker — a real limiter belongs at the edge or in a shared
 * store. Documented rather than pretended otherwise; see SECURITY.md.
 */

interface Window {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Window>();
const MAX_KEYS = 5000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): RateLimitResult {
  // Bound memory: a flood of unique keys must not grow the map without limit.
  if (buckets.size > MAX_KEYS) {
    for (const [k, w] of buckets) if (w.resetAt <= now) buckets.delete(k);
    if (buckets.size > MAX_KEYS) buckets.clear();
  }

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  const allowed = existing.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - existing.count),
    retryAfterSeconds: allowed ? 0 : Math.ceil((existing.resetAt - now) / 1000),
  };
}

/**
 * Best-effort client identity from proxy headers. Spoofable, which is why it
 * only ever gates rate limits and never authorises anything.
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim();
  return ip || request.headers.get("x-real-ip") || "unknown";
}

/** Test seam. */
export function resetRateLimits(): void {
  buckets.clear();
}
