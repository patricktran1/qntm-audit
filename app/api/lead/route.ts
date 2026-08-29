import { NextResponse } from "next/server";

/**
 * Consultation requests. Stored nowhere by default — this MVP forwards to a
 * webhook if one is configured and otherwise accepts the request so the UI can
 * confirm honestly. There is no database in this product on purpose.
 */
interface LeadPayload {
  email?: string;
  name?: string;
  practice?: string;
  note?: string;
  /** The encoded answers, so the brief can be regenerated from the lead. */
  report?: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(request: Request) {
  let body: LeadPayload;
  try {
    body = (await request.json()) as LeadPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const email = (body.email ?? "").trim();
  if (!EMAIL.test(email) || email.length > 254) {
    return NextResponse.json(
      { ok: false, error: "A valid email address is required." },
      { status: 400 },
    );
  }

  const lead = {
    email,
    name: (body.name ?? "").slice(0, 120),
    practice: (body.practice ?? "").slice(0, 160),
    note: (body.note ?? "").slice(0, 2000),
    report: (body.report ?? "").slice(0, 400),
    receivedAt: new Date().toISOString(),
  };

  if (process.env.LEAD_WEBHOOK_URL) {
    try {
      await fetch(process.env.LEAD_WEBHOOK_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(lead),
      });
    } catch {
      return NextResponse.json(
        { ok: false, error: "We could not record that. Please email us directly." },
        { status: 502 },
      );
    }
  }

  return NextResponse.json({ ok: true });
}
