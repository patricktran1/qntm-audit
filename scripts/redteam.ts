/**
 * Runs the audit as each buyer archetype and prints what they would actually
 * see. Used to red-team the product rather than to test it — the assertions
 * live in tests/.
 */
import { runAudit } from "../lib/engine/audit";
import { buildBrief } from "../lib/engine/brief";
import { DEFAULT_ASSUMPTIONS } from "../lib/engine/assumptions";
import { EMPTY_ANSWERS } from "../lib/engine/questions";
import { currencyExact } from "../lib/format";
import type { AuditAnswers } from "../lib/engine/types";

const A = (o: Partial<AuditAnswers>): AuditAnswers => ({ ...EMPTY_ANSWERS, ...o });

const ARCHETYPES: { name: string; note: string; answers: AuditAnswers }[] = [
  {
    name: "1 · Skeptical solo derm, genuinely well-run",
    note: "Should be told there is nothing worth buying.",
    answers: A({
      physicians: 1, apps: 1, annualCollections: 1_900_000, clinicalDaysPerWeek: 4,
      patientsPerProviderPerDay: 30, frontOfficeFte: 2, clinicalStaffFte: 3,
      billingModel: "outsourced", billingPercent: 4, noShowRate: 3,
      callsPerDay: 110, unansweredCallPercent: 4, thirdNextAvailableDays: 8,
      physicianAdminHoursPerWeek: 4, priorAuthStaffHoursPerWeek: 3,
      daysInAR: 26, softwareSpendPerMonth: 2_400,
    }),
  },
  {
    name: "2 · Four-provider group owner",
    note: "Mixed picture, real money at stake.",
    answers: A({
      physicians: 4, apps: 2, annualCollections: 7_800_000, clinicalDaysPerWeek: 4.5,
      patientsPerProviderPerDay: 30, frontOfficeFte: 9, clinicalStaffFte: 12,
      billingModel: "outsourced", billingPercent: 6.5, noShowRate: 10,
      callsPerDay: 420, unansweredCallPercent: 19, thirdNextAvailableDays: 33,
      physicianAdminHoursPerWeek: 11, priorAuthStaffHoursPerWeek: 40,
      daysInAR: 49, softwareSpendPerMonth: 12_000,
    }),
  },
  {
    name: "3 · Practice administrator, precise numbers",
    note: "Will check every figure.",
    answers: A({
      physicians: 3, apps: 1, annualCollections: 4_150_000, clinicalDaysPerWeek: 4,
      patientsPerProviderPerDay: 27, frontOfficeFte: 6.5, clinicalStaffFte: 8,
      billingModel: "in_house", billingFte: 2.5, noShowRate: 7.5,
      callsPerDay: 265, unansweredCallPercent: 12, thirdNextAvailableDays: 17,
      physicianAdminHoursPerWeek: 6.5, priorAuthStaffHoursPerWeek: 19,
      daysInAR: 41, softwareSpendPerMonth: 6_800,
    }),
  },
  {
    name: "4 · Physician who does not know their numbers",
    note: "Skips everything optional.",
    answers: A({
      physicians: 2, apps: 0, annualCollections: 2_600_000, clinicalDaysPerWeek: 4,
      patientsPerProviderPerDay: 28, frontOfficeFte: 4, clinicalStaffFte: 5,
      billingModel: "outsourced", billingPercent: 6,
    }),
  },
  {
    name: "5 · Sophisticated physician, hostile assumptions",
    note: "Same practice as #2 with every assumption dialled against us.",
    answers: A({
      physicians: 4, apps: 2, annualCollections: 7_800_000, clinicalDaysPerWeek: 4.5,
      patientsPerProviderPerDay: 30, frontOfficeFte: 9, clinicalStaffFte: 12,
      billingModel: "outsourced", billingPercent: 6.5, noShowRate: 10,
      callsPerDay: 420, unansweredCallPercent: 19, thirdNextAvailableDays: 33,
      physicianAdminHoursPerWeek: 11, priorAuthStaffHoursPerWeek: 40,
      daysInAR: 49, softwareSpendPerMonth: 12_000,
    }),
  },
];

for (const [i, arch] of ARCHETYPES.entries()) {
  const hostile = i === 4;
  const k = hostile
    ? { ...DEFAULT_ASSUMPTIONS, contributionMargin: 0.3, noShowRecaptureRate: 0.1,
        callbackRate: 0.95, newPatientCallShare: 0.03 }
    : DEFAULT_ASSUMPTIONS;
  const r = runAudit(arch.answers, k);
  const b = buildBrief(r);
  console.log("\n" + "=".repeat(76));
  console.log(arch.name);
  console.log(arch.note);
  console.log("=".repeat(76));
  console.log(`SCORE ${r.score.overall ?? "withheld"} · ${r.score.band} · coverage ${(r.score.coverage * 100).toFixed(0)}% · completeness ${(r.completeness * 100).toFixed(0)}%`);
  console.log(`RANGE ${currencyExact(r.opportunityLow)}–${currencyExact(r.opportunityHigh)}/yr` +
    (r.oneTimeHigh > 0 ? ` + ${currencyExact(r.oneTimeLow)}–${currencyExact(r.oneTimeHigh)} one-time` : ""));
  console.log(`VERDICT ${r.verdict.level.toUpperCase()} · posture ${r.offer.posture}`);
  console.log(`  "${r.verdict.headline}"`);
  console.log(`  basis: ${r.verdict.basis.join(" · ")}`);
  console.log(`OFFER  "${r.offer.headline}" → [${r.offer.primaryLabel}]`);
  console.log("\nEXEC:");
  r.executiveSummary.forEach((l) => console.log("  • " + l));
  console.log("\nTOP:");
  r.topOpportunities.forEach((f, n) =>
    console.log(`  ${n + 1}. [${f.bucket}] ${f.title} — I:${f.impact} E:${f.effort} C:${f.confidence}` +
      (f.estimate ? ` ${currencyExact(f.estimate.low)}–${currencyExact(f.estimate.high)}` : " (not quantified)")));
  console.log(`\nBUCKETS: ${r.findings.map((f) => `${f.id}:${f.bucket}`).join(" ")}`);
  console.log(`AUTOMATION: ${r.automationCandidates.map((c) => c.label).join(" | ") || "none"}`);
  console.log(`FIT: ${b.serviceFit.filter((s) => s.fit !== "weak").map((s) => `${s.service}=${s.fit}`).join(", ")}`);
  console.log(`DISQUALIFIERS: ${b.disqualifiers.join(" / ")}`);
  console.log(`CONVO: ${b.recommendedConversation}`);
}
