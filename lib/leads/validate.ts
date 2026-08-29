import { decodeAnswers } from "../share";
import { isSessionId, newSessionId } from "../pilot/attribution";
import { sanitizeAttribution } from "../pilot/validate";
import { LEAD_ROLES, NEXT_STEPS, type LeadInput } from "./types";

/**
 * Boundary validation. Everything crossing into the server is untrusted: the
 * form is trivially bypassable and the encoded report travels in a URL anyone
 * can edit. Nothing here trusts a client-side check.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** C0 and C1 control characters, which have no business in any of these fields. */
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/g;

const LIMITS = {
  name: 120,
  email: 254,
  practiceName: 160,
  location: 120,
  website: 300,
  concern: 2000,
  report: 400,
} as const;

export type ValidationResult =
  | { ok: true; value: LeadInput }
  | { ok: false; error: string; field?: keyof LeadInput };

function str(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.replace(CONTROL, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export function validateLead(body: unknown): ValidationResult {
  if (typeof body !== "object" || body === null)
    return { ok: false, error: "Malformed request." };
  const b = body as Record<string, unknown>;

  const email = str(b.email, LIMITS.email).toLowerCase();
  if (!EMAIL.test(email))
    return {
      ok: false,
      error: "A valid email address is required.",
      field: "email",
    };

  const role = LEAD_ROLES.some((r) => r.value === b.role)
    ? (b.role as LeadInput["role"])
    : "other";
  const nextStep = NEXT_STEPS.some((n) => n.value === b.nextStep)
    ? (b.nextStep as LeadInput["nextStep"])
    : "call";

  // Only http(s) URLs. Rejecting other schemes here removes any question about
  // what happens when this string is later rendered or clicked internally.
  const rawSite = str(b.website, LIMITS.website);
  const website = /^https?:\/\//i.test(rawSite)
    ? rawSite
    : /^[\w.-]+\.[a-z]{2,}([/?#].*)?$/i.test(rawSite)
      ? `https://${rawSite}`
      : "";

  // The report string must decode to a real audit, or it is dropped — an
  // undecodable value would produce a brief link that 404s on arrival.
  const report = str(b.report, LIMITS.report);
  const decoded = decodeAnswers(report);

  return {
    ok: true,
    value: {
      name: str(b.name, LIMITS.name),
      email,
      practiceName: str(b.practiceName, LIMITS.practiceName),
      role,
      location: str(b.location, LIMITS.location),
      website,
      concern: str(b.concern, LIMITS.concern),
      nextStep,
      consent: b.consent === true,
      report: decoded ? report : "",
      // A malformed or absent session id gets a fresh one rather than being
      // rejected: losing a real lead over a storage detail would be absurd.
      sessionId: isSessionId(b.sessionId) ? b.sessionId : newSessionId(),
      attribution: sanitizeAttribution(b.attribution) as Record<string, string>,
      entryMode: b.entryMode === "demo" ? "demo" : "direct",
    },
  };
}
