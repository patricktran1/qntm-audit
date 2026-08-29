import { runAudit } from "../lib/engine/audit";
import { PRACTICE_FIXTURES } from "../lib/engine/fixtures";
import { currencyExact } from "../lib/format";

for (const f of PRACTICE_FIXTURES) {
  const r = runAudit(f.answers);
  const c = f.answers.annualCollections ?? 0;
  const share = c > 0 ? ((r.opportunityHigh / c) * 100).toFixed(1) + "%" : "—";
  console.log(
    `${f.id.padEnd(24)} ${String(r.score.overall ?? "—").padStart(3)} ${r.verdict.level.padEnd(18)} ` +
    `${(r.topOpportunities[0]?.category ?? "none").padEnd(19)} rec=${share.padStart(6)} ` +
    `1x=${currencyExact(r.oneTimeHigh).padStart(10)} auto=${r.automationCandidates.length} ` +
    `posture=${r.offer.posture}`,
  );
}
