
import type { DiscoveryOutcome, PilotSession } from "./types";

/**
 * CSV EXPORT
 *
 * Stable column names, suitable for Sheets or pandas. Two deliberate
 * properties:
 *
 *  - The analytical export carries no identifying information at all. No name,
 *    email, practice name, website, or free text. A pilot analysis does not
 *    need them, and an export that travels between machines should not carry
 *    them by default.
 *  - Every practice figure is a band, matching the analytics contract, so an
 *    exported file cannot become a shadow copy of practice financials.
 *
 * The encoded report is NOT in the default export. It contains the practice's
 * raw operating figures, including annual collections, and a file that travels
 * between machines should not carry them by default. Pass `full=1` when an
 * operator genuinely needs to reopen the exact audits from a spreadsheet.
 */

/** RFC 4180 escaping, plus neutralising anything a spreadsheet would execute. */
export function csvCell(value: unknown): string {
  const raw =
    value === null || value === undefined
      ? ""
      : typeof value === "string"
        ? value
        : String(value);
  // A leading =, +, -, @, tab or CR makes Excel and Sheets treat the cell as a
  // formula. Prefix with a single quote so it is read as text.
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  // Trailing newline so the file concatenates cleanly.
  return lines.join("\r\n") + "\r\n";
}

export const SESSION_COLUMNS = [
  "session_id",
  "completed_at",
  "first_seen",
  "model_version",
  "variant",
  "source",
  "campaign",
  "cohort",
  "ref",
  "entry_mode",
  "is_demo",
  "duration_ms",
  "verdict",
  "cta_posture",
  "score",
  "coverage",
  "completeness",
  "provider_band",
  "collections_band",
  "opportunity_band",
  "top_category",
  "finding_categories",
  "actionable_finding_ids",
  "quantified_count",
  "unscored_dimensions",
  "skipped_fields",
  "assumptions_changed",
  "assumption_keys_changed",
  "cta_clicked",
  "lead_submitted",
];

/** Only added when the caller explicitly opts in. Carries raw practice figures. */
export const SESSION_FULL_COLUMNS = [...SESSION_COLUMNS, "report"];

export function sessionsCsv(
  sessions: PilotSession[],
  includeReport = false,
): string {
  const rows = sessions.map((s) => {
    const base: unknown[] = [
      s.sessionId,
      s.completedAt,
      s.firstSeen,
      s.snapshot.modelVersion,
      s.variant ?? "",
      s.attribution.source ?? "",
      s.attribution.campaign ?? "",
      s.attribution.cohort ?? "",
      s.attribution.ref ?? "",
      s.entryMode,
      s.isDemo ? "true" : "false",
      s.durationMs ?? "",
      s.snapshot.verdict,
      s.snapshot.posture,
      s.snapshot.score ?? "",
      s.snapshot.coverage.toFixed(3),
      s.snapshot.completeness.toFixed(3),
      s.snapshot.providerBand,
      s.snapshot.collectionsBand,
      s.snapshot.opportunityBand,
      s.snapshot.topCategory ?? "",
      s.snapshot.findingCategories.join("|"),
      s.snapshot.actionableFindingIds.join("|"),
      s.snapshot.quantifiedCount,
      s.snapshot.unscoredDimensions.join("|"),
      s.snapshot.skippedFields.join("|"),
      s.assumptionChanges.length,
      s.assumptionChanges.map((c) => c.key).join("|"),
      s.ctaClickedAt ?? "",
      s.leadSubmittedAt ?? "",
    ];
    return includeReport ? [...base, s.report] : base;
  });
  return toCsv(includeReport ? SESSION_FULL_COLUMNS : SESSION_COLUMNS, rows);
}

export const OUTCOME_COLUMNS = [
  "session_id",
  "recorded_at",
  "model_version",
  "call_outcome",
  "audit_accuracy",
  "actual_pain",
  "predicted_pain",
  "pain_agreement",
  "economic_reaction",
  "most_challenged_assumption",
  "service_relevant",
  "next_action",
  "why_buy",
  "why_not_buy",
  "next_action_note",
];

/**
 * Outcomes carry operator notes, which is why this export is separate from the
 * session export and is not the default. The notes are the operator's words
 * about a business conversation, never a physician's contact details.
 */
export function outcomesCsv(
  outcomes: DiscoveryOutcome[],
  sessions: PilotSession[],
  includeNotes: boolean,
): string {
  const byId = new Map(sessions.map((s) => [s.sessionId, s]));
  const columns = includeNotes
    ? OUTCOME_COLUMNS
    : OUTCOME_COLUMNS.filter(
        (c) => !["why_buy", "why_not_buy", "next_action_note"].includes(c),
      );

  const rows = outcomes.map((o) => {
    const predicted = byId.get(o.sessionId)?.snapshot.topCategory ?? "";
    const base: unknown[] = [
      o.sessionId,
      o.recordedAt,
      o.modelVersion,
      o.callOutcome,
      o.auditAccuracy,
      o.actualPain,
      predicted,
      predicted && o.actualPain
        ? predicted === o.actualPain
          ? "match"
          : "mismatch"
        : "",
      o.economicReaction,
      o.mostChallengedAssumption,
      o.serviceRelevant,
      o.nextAction,
    ];
    return includeNotes
      ? [...base, o.whyBuy, o.whyNotBuy, o.nextActionNote]
      : base;
  });
  return toCsv(columns, rows);
}
