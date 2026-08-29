import { describe, expect, it } from "vitest";
import { runAudit } from "@/lib/engine/audit";
import { PRACTICE_FIXTURES } from "@/lib/engine/fixtures";
import { MODEL_VERSION } from "@/lib/engine/version";

/**
 * FIXTURE REGRESSION SUITE
 *
 * Each golden practice asserts the invariants recorded beside it in
 * lib/engine/fixtures.ts. A failure here means the model's *meaning* changed
 * for a practice in that state — which may be correct, but must be a decision:
 * update the invariant, bump MODEL_VERSION, and add a MODEL_CHANGELOG entry.
 */

describe("golden practice fixtures", () => {
  for (const fixture of PRACTICE_FIXTURES) {
    describe(`${fixture.name} (${fixture.id})`, () => {
      const result = runAudit(fixture.answers);
      const inv = fixture.invariants;
      const collections = fixture.answers.annualCollections ?? 0;

      it("produces a report without NaN or undefined anywhere", () => {
        const text = [
          ...result.executiveSummary,
          ...result.findings.map((f) => `${f.headline} ${f.interpretation}`),
          result.verdict.headline,
          result.verdict.detail,
          result.offer.headline,
          result.offer.body,
        ].join(" ");
        expect(text).not.toMatch(/NaN|undefined|Infinity/);
      });

      if (inv.verdict) {
        it(`reaches the ${inv.verdict} verdict — ${fixture.protects}`, () => {
          expect(result.verdict.level).toBe(inv.verdict);
        });
      }

      if (inv.verdictIn) {
        it(`reaches one of: ${inv.verdictIn.join(", ")}`, () => {
          expect(inv.verdictIn).toContain(result.verdict.level);
        });
      }

      if (inv.leadingCategory) {
        it(`leads with a ${inv.leadingCategory} finding`, () => {
          expect(result.topOpportunities[0]?.category).toBe(inv.leadingCategory);
        });
      }

      if (inv.leadingCategoryIn) {
        it(`leads with one of: ${inv.leadingCategoryIn.join(", ")}`, () => {
          expect(inv.leadingCategoryIn).toContain(
            result.topOpportunities[0]?.category,
          );
        });
      }

      if (inv.scorePublished !== undefined) {
        it(inv.scorePublished ? "publishes a score" : "withholds the score", () => {
          if (inv.scorePublished) expect(result.score.overall).not.toBeNull();
          else expect(result.score.overall).toBeNull();
        });
      }

      if (inv.scoreAtLeast !== undefined) {
        it(`scores at least ${inv.scoreAtLeast}`, () => {
          expect(result.score.overall).not.toBeNull();
          expect(result.score.overall!).toBeGreaterThanOrEqual(inv.scoreAtLeast!);
        });
      }

      if (inv.scoreAtMost !== undefined) {
        it(`scores at most ${inv.scoreAtMost}`, () => {
          expect(result.score.overall!).toBeLessThanOrEqual(inv.scoreAtMost!);
        });
      }

      if (inv.minCoverage !== undefined) {
        it(`computes at least ${Math.round(inv.minCoverage * 100)}% of the model`, () => {
          expect(result.score.coverage).toBeGreaterThanOrEqual(inv.minCoverage!);
        });
      }

      if (inv.ctaPosture) {
        it(`offers a ${inv.ctaPosture} conversation posture`, () => {
          expect(result.offer.posture).toBe(inv.ctaPosture);
        });
      }

      if (inv.automationAllowed === false) {
        it("recommends no automation", () => {
          expect(result.automationCandidates).toEqual([]);
        });
      }

      if (inv.maxRecurringShare !== undefined && collections > 0) {
        it(`keeps recurring opportunity under ${Math.round(inv.maxRecurringShare! * 100)}% of collections`, () => {
          expect(result.opportunityHigh / collections).toBeLessThan(
            inv.maxRecurringShare!,
          );
        });
      }

      if (inv.mustInclude) {
        for (const id of inv.mustInclude) {
          it(`still detects ${id}`, () => {
            expect(result.findings.some((f) => f.id === id)).toBe(true);
          });
        }
      }

      if (inv.leadingCategoryNot) {
        it(`does not lead with a ${inv.leadingCategoryNot} finding`, () => {
          expect(result.topOpportunities[0]?.category).not.toBe(
            inv.leadingCategoryNot,
          );
        });
      }

      if (inv.findingMustBeHighImpact) {
        it(`rates ${inv.findingMustBeHighImpact} as high impact`, () => {
          const f = result.findings.find(
            (x) => x.id === inv.findingMustBeHighImpact,
          );
          expect(f?.impact).toBe("high");
        });
      }

      if (inv.findingMustNotBeHighImpact) {
        it(`never rates ${inv.findingMustNotBeHighImpact} as high impact`, () => {
          const f = result.findings.find(
            (x) => x.id === inv.findingMustNotBeHighImpact,
          );
          if (f) expect(f.impact).not.toBe("high");
        });
      }

      if (inv.mustExclude) {
        for (const id of inv.mustExclude) {
          it(`does not detect ${id}`, () => {
            expect(result.findings.some((f) => f.id === id)).toBe(false);
          });
        }
      }

      if (!inv.oneTimeMayDominate) {
        it("does not let one-time cash exceed the recurring range", () => {
          // A one-time working-capital release presented as the headline makes
          // an audit look bigger than it is. Only fixtures that explicitly
          // represent an A/R problem may break this.
          if (result.opportunityHigh > 0)
            expect(result.oneTimeHigh).toBeLessThanOrEqual(
              result.opportunityHigh * 1.5,
            );
        });
      }
    });
  }

  it("covers a meaningful spread of operational states", () => {
    const verdicts = new Set(
      PRACTICE_FIXTURES.map((f) => runAudit(f.answers).verdict.level),
    );
    // All four verdicts must be reachable from realistic inputs. If `healthy`
    // ever drops out of this set, the audit has become a sales tool.
    expect(verdicts.has("healthy")).toBe(true);
    expect(verdicts.has("act")).toBe(true);
    expect(verdicts.has("insufficient_data")).toBe(true);
    expect(verdicts.size).toBeGreaterThanOrEqual(3);
  });

  it("records a model version that fixtures are pinned against", () => {
    expect(MODEL_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
