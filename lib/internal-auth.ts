import { INTERNAL_COOKIE } from "@/middleware";

/**
 * Cookie check for internal API routes.
 *
 * The middleware gate covers /internal pages, but route handlers under
 * /internal/api re-check for themselves: a write that shapes calibration or a
 * read that exports pilot data must not depend on matcher configuration alone.
 *
 * Same posture as the middleware: constant-time comparison, and in production
 * a missing token fails closed. 404 semantics are the caller's job.
 */
export function internalAuthorised(request: Request): boolean {
  const token = process.env.INTERNAL_ACCESS_TOKEN;
  if (!token) return process.env.NODE_ENV !== "production";
  // Parse the header the way the middleware's cookie jar does — last
  // well-formed occurrence wins, malformed pairs are skipped — rather than
  // regexing the first match. A stale duplicate cookie from another domain
  // scope used to make the two layers disagree, and an undecodable value threw
  // a URIError that surfaced as a 500 instead of the intended 404.
  const header = request.headers.get("cookie") ?? "";
  let value: string | null = null;
  for (const pair of header.split(/;\s*/)) {
    const eq = pair.indexOf("=");
    if (eq < 0) continue;
    if (pair.slice(0, eq).trim() !== INTERNAL_COOKIE) continue;
    try {
      value = decodeURIComponent(pair.slice(eq + 1));
    } catch {
      // Malformed percent-encoding: skip this pair, as the cookie jar does.
    }
  }
  if (value === null) return false;
  if (value.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < value.length; i++)
    diff |= value.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}
