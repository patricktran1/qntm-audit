import { EMPTY_ANSWERS } from "./engine/questions";
import type { AuditAnswers, BillingModel } from "./engine/types";

/**
 * Answers are encoded into the URL so a report is shareable and re-openable
 * with no account, no database, and no lead-capture gate. The encoding is a
 * fixed-order, compact list — short enough for a real link.
 */

const ORDER: (keyof AuditAnswers)[] = [
  "physicians",
  "apps",
  "annualCollections",
  "clinicalDaysPerWeek",
  "patientsPerProviderPerDay",
  "frontOfficeFte",
  "clinicalStaffFte",
  "billingModel",
  "billingPercent",
  "billingFte",
  "noShowRate",
  "callsPerDay",
  "unansweredCallPercent",
  "thirdNextAvailableDays",
  "physicianAdminHoursPerWeek",
  "priorAuthStaffHoursPerWeek",
  "daysInAR",
  "softwareSpendPerMonth",
];

const SEPARATOR = "_";

const BILLING_CODES: Record<BillingModel, string> = {
  outsourced: "o",
  in_house: "i",
  hybrid: "h",
};
const BILLING_FROM_CODE: Record<string, BillingModel> = {
  o: "outsourced",
  i: "in_house",
  h: "hybrid",
};

/**
 * Fields are joined with "_" rather than "." so decimal answers (4.5 clinic
 * days, 0.5 FTE) survive the round trip. "~" marks an unanswered field so
 * position is preserved.
 */
export function encodeAnswers(a: AuditAnswers): string {
  const parts = ORDER.map((key) => {
    const v = a[key];
    if (v === null || v === undefined) return "~";
    if (key === "billingModel") return BILLING_CODES[v as BillingModel] ?? "~";
    return String(v);
  });
  return parts.join(SEPARATOR);
}

export function decodeAnswers(encoded: string | null | undefined): AuditAnswers | null {
  if (!encoded) return null;
  const parts = encoded.split(SEPARATOR);
  if (parts.length !== ORDER.length) return null;
  const out: AuditAnswers = { ...EMPTY_ANSWERS };
  let decoded = 0;
  for (let i = 0; i < ORDER.length; i++) {
    const key = ORDER[i]!;
    const raw = parts[i];
    // An empty segment means "not answered", never zero. A mangled or
    // truncated link used to decode to a practice with zero physicians and
    // zero collections, which rendered a confident report about nothing.
    if (raw === undefined || raw === "" || raw === "~") continue;
    if (key === "billingModel") {
      const model = BILLING_FROM_CODE[raw];
      if (model) {
        out.billingModel = model;
        decoded += 1;
      }
      continue;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) continue;
    // Reject values outside any plausible range rather than rendering nonsense
    // from a hand-edited URL.
    if (parsed < 0 || parsed > 1_000_000_000) continue;
    (out[key] as number | null) = parsed;
    decoded += 1;
  }
  // A payload of the right shape carrying no usable values is not a report.
  // Returning it would render an audit of an empty practice.
  return decoded === 0 ? null : out;
}
