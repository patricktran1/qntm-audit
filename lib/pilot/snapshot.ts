import { collectionsBand, providerBand } from "../analytics";
import { MODEL_VERSION } from "../engine/version";
import type { AuditResult, Category } from "../engine/types";
import type { AuditSnapshot, OpportunityBand } from "./types";

/**
 * Freezes what the physician was actually shown, in banded form, alongside the
 * model version that produced it.
 *
 * Everything here is derived server-side from the answers rather than accepted
 * from the client, so a crafted request cannot poison the pilot data with a
 * verdict the engine never produced.
 */

export function opportunityBand(
  opportunityHigh: number,
  collections: number | null,
): OpportunityBand {
  if (opportunityHigh <= 0) return "none";
  if (collections === null || collections <= 0) return "unknown";
  const share = opportunityHigh / collections;
  if (share < 0.01) return "<1%";
  if (share < 0.03) return "1-3%";
  if (share < 0.06) return "3-6%";
  if (share < 0.12) return "6-12%";
  return "12%+";
}

export function buildSnapshot(result: AuditResult): AuditSnapshot {
  const categories = new Set<Category>();
  for (const f of result.findings) categories.add(f.category);

  const skippedFields = (
    Object.keys(result.answers) as (keyof typeof result.answers)[]
  ).filter((k) => result.answers[k] === null);

  return {
    modelVersion: MODEL_VERSION,
    verdict: result.verdict.level,
    posture: result.offer.posture,
    score: result.score.overall,
    coverage: result.score.coverage,
    completeness: result.completeness,
    providerBand: providerBand(result.answers.physicians),
    collectionsBand: collectionsBand(result.answers.annualCollections),
    topCategory: result.topOpportunities[0]?.category ?? null,
    findingCategories: [...categories],
    actionableFindingIds: result.findings
      .filter((f) => f.bucket === "quick_win" || f.bucket === "strategic_bet")
      .map((f) => f.id),
    quantifiedCount: result.quantifiedCount,
    opportunityBand: opportunityBand(
      result.opportunityHigh,
      result.answers.annualCollections,
    ),
    unscoredDimensions: result.score.dimensions
      .filter((d) => d.score === null)
      .map((d) => d.key),
    skippedFields,
  };
}
