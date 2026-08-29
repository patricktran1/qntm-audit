import { NextResponse } from "next/server";
import { MODEL_VERSION } from "@/lib/engine/version";
import { pilotStore } from "@/lib/pilot/store";
import { validateOutcomeWrite } from "@/lib/pilot/validate";
import { INTERNAL_COOKIE } from "@/middleware";

/**
 * Records a discovery-call outcome. Operator-only.
 *
 * The middleware gate covers /internal pages but not API routes, so this
 * endpoint re-checks the internal cookie itself rather than assuming it is
 * unreachable. Writes here shape model calibration, so an anonymous write
 * would be worse than no write at all.
 */

const MAX_BODY_BYTES = 8 * 1024;

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

export async function POST(request: Request) {
  if (!authorised(request))
    return NextResponse.json({ ok: false }, { status: 404 });

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES)
    return NextResponse.json({ ok: false }, { status: 413 });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "malformed" }, { status: 400 });
  }

  const validated = validateOutcomeWrite(parsed);
  if (!validated.ok)
    return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });

  const store = pilotStore();
  if (!store.configured)
    return NextResponse.json(
      {
        ok: false,
        error:
          "No pilot store configured. Set PILOT_KV_REST_URL and PILOT_KV_REST_TOKEN to record outcomes.",
      },
      { status: 503 },
    );

  const written = await store.putOutcome({
    ...validated.value,
    modelVersion: MODEL_VERSION,
  });
  if (!written.ok)
    return NextResponse.json(
      { ok: false, error: "Could not record that. Check the pilot store." },
      { status: 502 },
    );

  return NextResponse.json({ ok: true });
}
