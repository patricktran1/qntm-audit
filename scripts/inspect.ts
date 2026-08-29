import { runAudit } from "../lib/engine/audit";
import { buildBrief } from "../lib/engine/brief";
import { DEMO_PROFILES } from "../lib/engine/profiles";
import { currencyExact, metricValue } from "../lib/format";

for (const p of DEMO_PROFILES) {
  const r = runAudit(p.answers);
  console.log("\n" + "=".repeat(78));
  console.log(p.name.toUpperCase());
  console.log("=".repeat(78));
  console.log("\nSCORE:", r.score.overall, "-", r.score.band, `(coverage ${(r.score.coverage*100).toFixed(0)}%)`);
  for (const d of r.score.dimensions) {
    console.log(`  ${d.label.padEnd(24)} ${d.score === null ? "  — " : String(Math.round(d.score)).padStart(3)}  w${d.weight}  [${d.confidence}]`);
    console.log(`      ${d.rationale}`);
  }
  console.log("\nEXEC SUMMARY:");
  r.executiveSummary.forEach((l) => console.log("  • " + l));
  console.log("\nOPPORTUNITY:", currencyExact(r.opportunityLow), "-", currencyExact(r.opportunityHigh));
  console.log("\nTOP OPPORTUNITIES:");
  for (const f of r.topOpportunities) {
    console.log(`\n  [${f.bucket}] ${f.title}  (I:${f.impact} E:${f.effort} C:${f.confidence}) rank=${f.rank.toFixed(2)}`);
    console.log(`  ${f.headline}`);
    f.evidence.forEach((e) => console.log(`     - ${e.label}: ${e.value}${e.reported ? "" : "  (derived)"}`));
    if (f.estimate) console.log(`     $ ${currencyExact(f.estimate.low)} - ${currencyExact(f.estimate.high)} [${f.estimate.kind}]  ${f.estimate.formula}`);
    console.log(`     NEXT: ${f.nextStep}`);
  }
  console.log("\nALL FINDINGS:", r.findings.map((f) => `${f.id}(${f.bucket})`).join(", "));
  console.log("\nMETRICS:");
  r.metrics.forEach((m) => console.log(`  ${m.label.padEnd(48)} ${metricValue(m.value, m.unit).padStart(12)}  [${m.confidence}]`));
  console.log("\nAUTOMATION:", r.automationCandidates.map((c) => c.label).join(" | "));
  const b = buildBrief(r);
  console.log("\nBRIEF fit:", b.serviceFit.map((s) => `${s.service}=${s.fit}`).join(", "));
  console.log("BRIEF convo:", b.recommendedConversation);
  console.log("BRIEF disq:", b.disqualifiers.join(" / "));
}
