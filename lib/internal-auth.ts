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
  const cookie = request.headers.get("cookie") ?? "";
  const match = new RegExp(`(?:^|;\\s*)${INTERNAL_COOKIE}=([^;]+)`).exec(cookie);
  if (!match?.[1]) return false;
  const value = decodeURIComponent(match[1]);
  if (value.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < value.length; i++)
    diff |= value.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}
