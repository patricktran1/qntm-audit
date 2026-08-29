import { currencyExact, metricValue, rawPercent } from "./format";
import { BUCKET_LABEL } from "./engine/prioritize";
import type { AuditResult } from "./engine/types";

/**
 * Plain-text report, for "Copy summary". Written to survive being pasted into
 * an email or a partner meeting agenda with no formatting at all.
 */
export function textSummary(r: AuditResult, url?: string): string {
  const L: string[] = [];
  const rule = "─".repeat(64);

  L.push("QNTM PRACTICE AUDIT");
  L.push(rule);
  L.push("");

  if (r.score.scoredCount > 0) {
    L.push(
      r.score.overall !== null
        ? `PRACTICE LEVERAGE SCORE: ${r.score.overall}/100 — ${r.score.band}`
        : `PRACTICE LEVERAGE SCORE: withheld — ${r.score.band}`,
    );
    L.push(
      `Scored across ${r.score.scoredCount} of ${r.score.totalCount} dimensions.`,
    );
    if (r.score.overall === null) L.push(wrap(r.score.bandDescription));
    L.push("");
    for (const d of r.score.dimensions) {
      L.push(
        `  ${d.label.padEnd(26)} ${
          d.score === null ? "not scored" : `${Math.round(d.score)}/100`
        }   (weight ${d.weight}, ${d.confidence} confidence)`,
      );
    }
    L.push("");
  }

  L.push("EXECUTIVE SUMMARY");
  L.push(rule);
  for (const line of r.executiveSummary) L.push(wrap(line));
  L.push("");

  if (r.topOpportunities.length > 0) {
    L.push("TOP OPPORTUNITIES");
    L.push(rule);
    r.topOpportunities.forEach((f, i) => {
      L.push("");
      L.push(`${i + 1}. ${f.title.toUpperCase()}  [${f.category}]`);
      L.push(wrap(f.headline));
      L.push("");
      L.push("   You reported:");
      for (const e of f.evidence)
        L.push(`     · ${e.label}: ${e.value}${e.reported ? "" : "  (calculated)"}`);
      L.push("");
      L.push(wrap(f.interpretation, "   "));
      if (f.estimate) {
        L.push("");
        L.push(
          `   Estimated ${
            f.estimate.recurrence === "one_time" ? "one-time" : "annual"
          } ${labelForKind(f.estimate.kind)}: ${currencyExact(
            f.estimate.low,
          )} – ${currencyExact(f.estimate.high)}`,
        );
        L.push(`   Formula: ${f.estimate.formula}`);
        for (const a of f.estimate.assumptions) L.push(`     · assumes ${a}`);
      }
      L.push("");
      L.push(
        `   Impact ${f.impact} · Effort ${f.effort} · ${f.confidence} confidence · ${
          BUCKET_LABEL[f.bucket]
        }`,
      );
      L.push(wrap(`Next step: ${f.nextStep}`, "   "));
    });
    L.push("");
  }

  if (r.opportunityHigh > 0) {
    L.push("IDENTIFIED RANGE");
    L.push(rule);
    L.push(
      `Recurring: ${currencyExact(r.opportunityLow)} – ${currencyExact(
        r.opportunityHigh,
      )} per year across ${r.quantifiedCount} quantified finding${
        r.quantifiedCount === 1 ? "" : "s"
      }.`,
    );
    if (r.oneTimeHigh > 0)
      L.push(
        `One-time cash release: ${currencyExact(r.oneTimeLow)} – ${currencyExact(
          r.oneTimeHigh,
        )} (working capital, not recurring revenue).`,
      );
    L.push(
      wrap(
        "These are directional estimates from self-reported figures and the assumptions below. They overlap — several draw on the same hours and slots — so the total is an order of magnitude, not a sum.",
      ),
    );
    L.push("");
  }

  if (r.metrics.length > 0) {
    L.push("ECONOMIC SNAPSHOT");
    L.push(rule);
    for (const m of r.metrics)
      L.push(
        `  ${m.label.padEnd(48)} ${metricValue(m.value, m.unit).padStart(12)}`,
      );
    L.push("");
  }

  if (r.automationCandidates.length > 0) {
    L.push("AUTOMATION CANDIDATES");
    L.push(rule);
    for (const c of r.automationCandidates) {
      L.push(`  ${c.label} (${c.confidence} confidence)`);
      L.push(wrap(`Why: ${c.trigger}`, "    "));
      L.push(wrap(c.readiness, "    "));
      L.push("");
    }
  }

  if (r.openQuestions.length > 0) {
    L.push("QUESTIONS THIS AUDIT CANNOT ANSWER");
    L.push(rule);
    for (const q of r.openQuestions) {
      L.push(`  · ${q.question}`);
      L.push(wrap(q.why, "    "));
    }
    L.push("");
  }

  L.push("NEXT 30 DAYS");
  L.push(rule);
  for (const p of r.plan) {
    L.push(`  ${p.week} — ${p.owner}`);
    L.push(wrap(p.action, "    "));
    L.push(wrap(`Unlocks: ${p.unlocks}`, "    "));
    L.push("");
  }

  L.push("ASSUMPTIONS USED");
  L.push(rule);
  L.push(`  Clinic weeks per year: ${r.assumptions.clinicalWeeksPerYear}`);
  L.push(`  Patient-facing hours per clinic day: ${r.assumptions.hoursPerClinicalDay}`);
  L.push(
    `  Marginal contribution margin: ${rawPercent(r.assumptions.contributionMargin * 100)}`,
  );
  L.push(
    `  Front-office loaded hourly cost: ${currencyExact(r.assumptions.frontOfficeLoadedHourlyCost)}`,
  );
  L.push(
    `  Clinical staff loaded hourly cost: ${currencyExact(r.assumptions.clinicalStaffLoadedHourlyCost)}`,
  );
  L.push(
    `  No-show slots refillable: ${rawPercent(r.assumptions.noShowRecaptureRate * 100)}`,
  );
  L.push(`  Staff minutes per handled call: ${r.assumptions.callHandleMinutes}`);
  L.push(
    `  Unanswered callers who try again: ${rawPercent(r.assumptions.callbackRate * 100)}`,
  );
  L.push(
    `  Inbound calls that are new-patient requests: ${rawPercent(
      r.assumptions.newPatientCallShare * 100,
    )}`,
  );
  L.push("");
  L.push(rule);
  L.push(
    wrap(
      "This audit contains no industry benchmark data. Every figure is either calculated from the practice's own inputs or derived from the named assumptions above. It is a directional operational diagnostic, not an audited financial statement, and not financial, legal, tax, or clinical advice.",
    ),
  );
  if (url) {
    L.push("");
    L.push(`Full report: ${url}`);
  }

  return L.join("\n");
}

function labelForKind(kind: "recoverable" | "freed_capacity" | "current_cost"): string {
  if (kind === "recoverable") return "recoverable value";
  if (kind === "freed_capacity") return "value of freed capacity";
  return "current cost";
}

/** Soft-wrap at 76 columns so the text survives email clients. */
function wrap(text: string, indent = ""): string {
  const width = 76 - indent.length;
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line.length === 0) line = word;
    else if (line.length + word.length + 1 <= width) line += ` ${word}`;
    else {
      lines.push(indent + line);
      line = word;
    }
  }
  if (line) lines.push(indent + line);
  return lines.join("\n");
}
