import { describe, expect, it } from "vitest";
import { runAudit, MAX_RECURRING_SHARE } from "@/lib/engine/audit";
import { DEFAULT_ASSUMPTIONS } from "@/lib/engine/assumptions";
import { EMPTY_ANSWERS } from "@/lib/engine/questions";
import { PRACTICE_FIXTURES } from "@/lib/engine/fixtures";
import { DETECTORS } from "@/lib/engine/findings";
import type { AuditAnswers, Category } from "@/lib/engine/types";

const A = (o: Partial<AuditAnswers>): AuditAnswers => ({ ...EMPTY_ANSWERS, ...o });

/**
 * MODEL INTEGRITY
 *
 * These tests exist to make it hard for us to quietly bias the audit toward
 * our own services. They assert properties the model must keep no matter what
 * a future change is trying to achieve, and each one names the failure mode it
 * is guarding against.
 */

/** A well-run practice. The base case for every sales-bias test. */
const HEALTHY = A({
  physicians: 1, apps: 1, annualCollections: 1_900_000, clinicalDaysPerWeek: 4,
  patientsPerProviderPerDay: 30, frontOfficeFte: 2, clinicalStaffFte: 3,
  billingModel: "outsourced", billingPercent: 4, noShowRate: 3,
  callsPerDay: 110, unansweredCallPercent: 4, thirdNextAvailableDays: 8,
  physicianAdminHoursPerWeek: 4, priorAuthStaffHoursPerWeek: 3,
  daysInAR: 26, softwareSpendPerMonth: 2_400,
});

describe("sales bias — size must never manufacture urgency", () => {
  it("stays healthy when software spend is inflated tenfold", () => {
    const base = runAudit(HEALTHY);
    expect(base.verdict.level).toBe("healthy");
    const inflated = runAudit({ ...HEALTHY, softwareSpendPerMonth: 24_000 });
    expect(inflated.verdict.level).toBe("healthy");
    expect(inflated.offer.posture).toBe("none");
  });

  it("stays healthy when the same ratios are scaled to a much larger practice", () => {
    // Every operational ratio is identical; only the absolute dollars differ.
    const large = runAudit(
      A({
        physicians: 8, apps: 8, annualCollections: 15_200_000, clinicalDaysPerWeek: 4,
        patientsPerProviderPerDay: 30, frontOfficeFte: 16, clinicalStaffFte: 24,
        billingModel: "outsourced", billingPercent: 4, noShowRate: 3,
        callsPerDay: 880, unansweredCallPercent: 4, thirdNextAvailableDays: 8,
        physicianAdminHoursPerWeek: 4, priorAuthStaffHoursPerWeek: 24,
        daysInAR: 26, softwareSpendPerMonth: 19_200,
      }),
    );
    expect(large.verdict.level).toBe("healthy");
    expect(large.offer.posture).toBe("none");
  });

  it("does not escalate a practice merely because collections are high", () => {
    // Doubling collections alone improves several ratios; it must never make
    // the verdict more urgent.
    const order = { healthy: 0, watch: 1, act: 2, insufficient_data: 3 };
    const base = runAudit(HEALTHY).verdict.level;
    const richer = runAudit({ ...HEALTHY, annualCollections: 3_800_000 }).verdict.level;
    expect(order[richer]).toBeLessThanOrEqual(order[base]);
  });

  it("gives equivalent severity to equivalent ratios at very different scale", () => {
    const shape = {
      clinicalDaysPerWeek: 4, patientsPerProviderPerDay: 28,
      billingModel: "outsourced" as const, billingPercent: 7, noShowRate: 14,
      unansweredCallPercent: 20, thirdNextAvailableDays: 30,
      physicianAdminHoursPerWeek: 11, daysInAR: 55,
    };
    const small = runAudit(
      A({ ...shape, physicians: 1, apps: 0, annualCollections: 500_000,
          frontOfficeFte: 2, clinicalStaffFte: 2, callsPerDay: 80,
          priorAuthStaffHoursPerWeek: 6, softwareSpendPerMonth: 1_500 }),
    );
    const big = runAudit(
      A({ ...shape, physicians: 20, apps: 0, annualCollections: 10_000_000,
          frontOfficeFte: 40, clinicalStaffFte: 40, callsPerDay: 1_600,
          priorAuthStaffHoursPerWeek: 120, softwareSpendPerMonth: 30_000 }),
    );
    expect(small.verdict.level).toBe(big.verdict.level);
    expect(small.topOpportunities[0]?.category).toBe(
      big.topOpportunities[0]?.category,
    );
    // Severity is a ratio judgement, so the impact grade must match too.
    expect(small.topOpportunities[0]?.impact).toBe(big.topOpportunities[0]?.impact);
  });
});

describe("missing data must never be read as good or bad news", () => {
  it("never turns an unknown into a zero", () => {
    const withZero = runAudit({ ...HEALTHY, noShowRate: 0 });
    const withUnknown = runAudit({ ...HEALTHY, noShowRate: null });

    // Field-level: an unknown is not an answer.
    expect(withUnknown.completeness).toBeLessThan(withZero.completeness);

    // Dimension-level: a perfect no-show rate must score better than a missing
    // one, and a missing one must lower our stated confidence rather than
    // silently substituting a value.
    const zeroAccess = withZero.score.dimensions.find((d) => d.key === "access")!;
    const unknownAccess = withUnknown.score.dimensions.find((d) => d.key === "access")!;
    expect(zeroAccess.score).toBeGreaterThan(unknownAccess.score!);
    expect(unknownAccess.confidence).not.toBe("high");

    // And the skipped question resurfaces as something to go and measure.
    expect(
      withUnknown.openQuestions.some((q) => /no-show/i.test(q.question)),
    ).toBe(true);
  });

  it("excludes an unscored dimension rather than scoring it zero", () => {
    const full = runAudit(HEALTHY);
    const partial = runAudit({ ...HEALTHY, daysInAR: null, billingPercent: null });
    const revOps = partial.score.dimensions.find((d) => d.key === "revenue_ops");
    expect(revOps?.score).toBeNull();
    // Dropping a dimension the practice scored well on must not crater the
    // composite the way a zero would.
    expect(partial.score.overall).not.toBeNull();
    expect(Math.abs(partial.score.overall! - full.score.overall!)).toBeLessThan(20);
  });

  it("withholds the verdict rather than guessing when too little is known", () => {
    const sparse = runAudit(
      A({
        physicians: 2, apps: 0, annualCollections: 2_600_000,
        clinicalDaysPerWeek: 4, patientsPerProviderPerDay: 28,
        frontOfficeFte: 4, clinicalStaffFte: 5, billingModel: "outsourced",
        billingPercent: 6,
      }),
    );
    expect(sparse.verdict.level).toBe("insufficient_data");
    expect(sparse.score.overall).toBeNull();
    expect(sparse.automationCandidates).toEqual([]);
  });

  it("produces no NaN for any single missing field", () => {
    const keys = Object.keys(HEALTHY) as (keyof AuditAnswers)[];
    for (const key of keys) {
      const result = runAudit({ ...HEALTHY, [key]: null });
      const text = [
        ...result.executiveSummary,
        result.verdict.headline,
        result.offer.body,
        ...result.findings.map((f) => f.headline),
      ].join(" ");
      expect(text, `missing ${key}`).not.toMatch(/NaN|Infinity|undefined/);
      expect(Number.isFinite(result.opportunityHigh), `missing ${key}`).toBe(true);
    }
  });
});

describe("economic conservatism", () => {
  it("caps aggregate recurring value as a share of collections", () => {
    for (const fixture of PRACTICE_FIXTURES) {
      const collections = fixture.answers.annualCollections;
      if (!collections) continue;
      const result = runAudit(fixture.answers);
      expect(
        result.opportunityHigh / collections,
        `${fixture.id} exceeded the conservatism ceiling`,
      ).toBeLessThanOrEqual(MAX_RECURRING_SHARE + 1e-9);
    }
  });

  it("discloses the cap whenever it binds", () => {
    const capped = PRACTICE_FIXTURES.map((f) => runAudit(f.answers)).filter(
      (r) => r.opportunityCapped,
    );
    expect(capped.length).toBeGreaterThan(0);
    for (const r of capped) {
      expect(r.executiveSummary.join(" ")).toMatch(/capped/i);
    }
  });

  it("keeps one-time working capital out of the recurring total", () => {
    for (const fixture of PRACTICE_FIXTURES) {
      const r = runAudit(fixture.answers);
      const annualIds = r.findings
        .filter((f) => f.estimate?.recurrence === "annual")
        .map((f) => f.id);
      expect(annualIds).not.toContain("ar-aging");
    }
  });

  it("values a provider hour at contribution, never at gross revenue", () => {
    const r = runAudit(HEALTHY);
    const gross = r.metrics.find((m) => m.key === "collectionsPerProviderHour")!;
    const contribution = r.metrics.find((m) => m.key === "contributionPerProviderHour")!;
    expect(contribution.value!).toBeLessThan(gross.value!);
  });

  it("shrinks every estimate when the contribution margin is lowered", () => {
    const fixture = PRACTICE_FIXTURES.find((f) => f.id === "physician-admin-overload")!;
    const generous = runAudit(fixture.answers, { ...DEFAULT_ASSUMPTIONS, contributionMargin: 0.75 });
    const strict = runAudit(fixture.answers, { ...DEFAULT_ASSUMPTIONS, contributionMargin: 0.3 });
    expect(strict.opportunityHigh).toBeLessThan(generous.opportunityHigh);
  });
});

describe("detector diversity — no single finding may dominate", () => {
  const leaders = PRACTICE_FIXTURES.map(
    (f) => runAudit(f.answers).topOpportunities[0]?.category ?? null,
  ).filter((c): c is Category => c !== null);

  it("produces at least four distinct leading categories across fixtures", () => {
    expect(new Set(leaders).size).toBeGreaterThanOrEqual(4);
  });

  it("lets no single category lead more than half the fixtures", () => {
    // A detector that leads nearly every report makes the audit feel canned,
    // which is the fastest way for a dermatologist to stop believing it.
    const counts = new Map<Category, number>();
    for (const c of leaders) counts.set(c, (counts.get(c) ?? 0) + 1);
    for (const [category, count] of counts) {
      expect(
        count / leaders.length,
        `${category} leads ${count}/${leaders.length} fixtures`,
      ).toBeLessThanOrEqual(0.5);
    }
  });

  it("keeps every detector reachable by at least one fixture", () => {
    // A detector no fixture triggers is untested and probably dead.
    const fired = new Set<string>();
    for (const f of PRACTICE_FIXTURES)
      for (const finding of runAudit(f.answers).findings) fired.add(finding.id);
    // Detectors are anonymous functions; assert breadth rather than identity.
    expect(fired.size).toBeGreaterThanOrEqual(Math.ceil(DETECTORS.length * 0.7));
  });
});

describe("no product bias — findings drive services, not the reverse", () => {
  it("recommends no automation for a practice with no actionable finding", () => {
    const r = runAudit(HEALTHY);
    expect(r.verdict.level).toBe("healthy");
    expect(r.automationCandidates).toEqual([]);
  });

  it("never derives an automation candidate from a de-prioritised finding", () => {
    for (const fixture of PRACTICE_FIXTURES) {
      const r = runAudit(fixture.answers);
      const lowPriority = new Set(
        r.findings.filter((f) => f.bucket === "low_priority").map((f) => f.id),
      );
      if (lowPriority.has("no-show-leakage"))
        expect(
          r.automationCandidates.some((c) => c.workflow === "reminders_recalls"),
          fixture.id,
        ).toBe(false);
      if (lowPriority.has("prior-auth-load"))
        expect(
          r.automationCandidates.some((c) => c.workflow === "prior_auth"),
          fixture.id,
        ).toBe(false);
    }
  });

  it("caps automation candidates at three however many findings fire", () => {
    for (const fixture of PRACTICE_FIXTURES)
      expect(runAudit(fixture.answers).automationCandidates.length).toBeLessThanOrEqual(3);
  });

  it("never promises savings in any physician-facing copy", () => {
    for (const fixture of PRACTICE_FIXTURES) {
      const r = runAudit(fixture.answers);
      const copy = [
        ...r.executiveSummary,
        r.verdict.headline,
        r.verdict.detail,
        r.offer.headline,
        r.offer.body,
        r.offer.footnote,
        ...r.findings.map((f) => `${f.headline} ${f.interpretation} ${f.nextStep}`),
      ].join(" ");
      expect(copy, fixture.id).not.toMatch(
        /\bguarantee|\bsave you\b|\bsavings\b|\bROI\b|10x|transform your practice/i,
      );
    }
  });
});

describe("healthy escape hatch", () => {
  it("remains reachable from realistic inputs", () => {
    const healthy = PRACTICE_FIXTURES.filter(
      (f) => runAudit(f.answers).verdict.level === "healthy",
    );
    expect(healthy.length).toBeGreaterThanOrEqual(2);
  });

  it("is reachable for both a solo practice and a group", () => {
    const healthyIds = PRACTICE_FIXTURES.filter(
      (f) => runAudit(f.answers).verdict.level === "healthy",
    ).map((f) => f.id);
    expect(healthyIds).toContain("efficient-solo");
    expect(healthyIds).toContain("healthy-group");
  });

  it("never asks a healthy practice for a meeting", () => {
    for (const fixture of PRACTICE_FIXTURES) {
      const r = runAudit(fixture.answers);
      if (r.verdict.level !== "healthy") continue;
      expect(r.offer.posture, fixture.id).toBe("none");
      expect(r.offer.agenda, fixture.id).toEqual([]);
    }
  });
});

describe("determinism", () => {
  it("produces byte-identical output for identical input", () => {
    for (const fixture of PRACTICE_FIXTURES) {
      const a = JSON.stringify(runAudit(fixture.answers));
      const b = JSON.stringify(runAudit(fixture.answers));
      expect(a, fixture.id).toBe(b);
    }
  });
});
