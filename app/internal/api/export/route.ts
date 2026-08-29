import { MODEL_VERSION } from "@/lib/engine/version";
import { isRealSession } from "@/lib/pilot/analyse";
import { outcomesCsv, sessionsCsv } from "@/lib/pilot/export";
import { pilotStore } from "@/lib/pilot/store";
import { internalAuthorised } from "@/lib/internal-auth";

/**
 * Protected pilot export. Requires the internal cookie — the middleware gate
 * covers /internal pages but not API routes, so this checks for itself.
 *
 * Defaults minimise identifying information: the session export carries no
 * contact details at all, and operator notes are only included when explicitly
 * requested with `notes=1`.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!internalAuthorised(request)) return new Response(null, { status: 404 });

  const url = new URL(request.url);
  const kindParam = url.searchParams.get("kind");
  const kind =
    kindParam === "outcomes" ? "outcomes" : kindParam === "backup" ? "backup" : "sessions";
  const includeNotes = url.searchParams.get("notes") === "1";
  // The encoded report carries raw practice figures, so it is opt-in.
  const includeReport = url.searchParams.get("full") === "1";
  // Analytical exports default to real pilot data only. Demo and QA traffic
  // come along only when explicitly asked for.
  const includeAll = url.searchParams.get("include") === "all";

  const all = await pilotStore().readAll();
  const stamp = new Date().toISOString().slice(0, 10);

  // The backup is not an analytical export: it is the complete dataset, full
  // fidelity, every flag intact, so a restore reproduces the store exactly.
  if (kind === "backup") {
    const body = JSON.stringify(
      {
        format: "qntm-pilot-backup",
        version: 1,
        exportedAt: new Date().toISOString(),
        modelVersion: MODEL_VERSION,
        sessions: all.sessions,
        outcomes: all.outcomes,
      },
      null,
      2,
    );
    return new Response(body, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="qntm-pilot-backup-${stamp}.json"`,
        "cache-control": "no-store, max-age=0",
        "x-robots-tag": "noindex, nofollow, noarchive",
      },
    });
  }

  const sessions = includeAll ? all.sessions : all.sessions.filter(isRealSession);
  const realIds = new Set(sessions.map((s) => s.sessionId));
  // An outcome follows its session's scope. Orphan outcomes (no stored
  // session) stay in: they are operator-authored calibration data and the
  // data-quality queue flags them separately.
  const outcomes = includeAll
    ? all.outcomes
    : all.outcomes.filter(
        (o) =>
          realIds.has(o.sessionId) ||
          !all.sessions.some((s) => s.sessionId === o.sessionId),
      );

  const body =
    kind === "outcomes"
      ? outcomesCsv(outcomes, sessions, includeNotes)
      : sessionsCsv(sessions, includeReport);

  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="qntm-pilot-${kind}-${stamp}.csv"`,
      "cache-control": "no-store, max-age=0",
      "x-robots-tag": "noindex, nofollow, noarchive",
    },
  });
}
