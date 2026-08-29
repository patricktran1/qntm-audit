import { outcomesCsv, sessionsCsv } from "@/lib/pilot/export";
import { pilotStore } from "@/lib/pilot/store";
import { INTERNAL_COOKIE } from "@/middleware";

/**
 * Protected pilot export. Requires the internal cookie — the middleware gate
 * covers /internal pages but not API routes, so this checks for itself.
 *
 * Defaults minimise identifying information: the session export carries no
 * contact details at all, and operator notes are only included when explicitly
 * requested with `notes=1`.
 */

export const dynamic = "force-dynamic";

function authorised(request: Request): boolean {
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

export async function GET(request: Request) {
  if (!authorised(request)) return new Response(null, { status: 404 });

  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") === "outcomes" ? "outcomes" : "sessions";
  const includeNotes = url.searchParams.get("notes") === "1";
  // The encoded report carries raw practice figures, so it is opt-in.
  const includeReport = url.searchParams.get("full") === "1";

  const { sessions, outcomes } = await pilotStore().readAll();
  const body =
    kind === "outcomes"
      ? outcomesCsv(outcomes, sessions, includeNotes)
      : sessionsCsv(sessions, includeReport);

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="qntm-pilot-${kind}-${stamp}.csv"`,
      "cache-control": "no-store, max-age=0",
      "x-robots-tag": "noindex, nofollow, noarchive",
    },
  });
}
