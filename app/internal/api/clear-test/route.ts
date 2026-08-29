import { NextResponse } from "next/server";
import { internalAuthorised } from "@/lib/internal-auth";
import { pilotStore } from "@/lib/pilot/store";

/**
 * Deletes every pilot session flagged isTest, together with its outcome.
 *
 * The narrowest destructive operation that makes the pre-launch checklist
 * possible: the predicate is the stored flag, not ids from the request, so
 * this endpoint cannot be pointed at a real record. There is deliberately no
 * "delete everything" counterpart — that lives in the Upstash console, with
 * the exact commands documented in PRIVACY.md.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!internalAuthorised(request))
    return NextResponse.json({ ok: false }, { status: 404 });

  const store = pilotStore();
  if (!store.configured)
    return NextResponse.json({
      ok: false,
      deleted: 0,
      error: "No pilot store configured — nothing to clear.",
    });

  const result = await store.deleteTestRecords();
  return NextResponse.json(result);
}
