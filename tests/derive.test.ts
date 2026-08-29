import { describe, expect, it } from "vitest";
import { buildMetrics, derive } from "@/lib/engine/derive";
import { DEFAULT_ASSUMPTIONS } from "@/lib/engine/assumptions";
import { EMPTY_ANSWERS } from "@/lib/engine/questions";
import { DEMO_PROFILES } from "@/lib/engine/profiles";
import type { AuditAnswers } from "@/lib/engine/types";

const K = DEFAULT_ASSUMPTIONS;

const base: AuditAnswers = {
  ...EMPTY_ANSWERS,
  physicians: 2,
  apps: 0,
  annualCollections: 2_000_000,
  clinicalDaysPerWeek: 4,
  patientsPerProviderPerDay: 25,
  frontOfficeFte: 3,
  clinicalStaffFte: 4,
  billingModel: "outsourced",
  billingPercent: 6,
};

describe("derive — arithmetic", () => {
  it("computes clinical days and hours from the weeks assumption", () => {
    const d = derive(base, K);
    expect(d.clinicalDaysPerYear).toBe(4 * 46);
    expect(d.providerClinicalHoursPerYear).toBe(4 * 46 * 8);
  });

  it("computes annual visits across all providers", () => {
    const d = derive({ ...base, apps: 1 }, K);
    // 25 patients × 3 providers × 184 days
    expect(d.annualVisits).toBe(25 * 3 * 184);
  });

  it("derives collections per visit and per hour consistently", () => {
    const d = derive(base, K);
    expect(d.collectionsPerVisit).toBeCloseTo(2_000_000 / (25 * 2 * 184), 6);
    expect(d.collectionsPerProviderHour).toBeCloseTo(
      2_000_000 / (2 * 4 * 46 * 8),
      6,
    );
  });

  it("prices a provider hour at contribution, never at gross revenue", () => {
    const d = derive(base, K);
    expect(d.contributionPerProviderHour).toBeCloseTo(
      d.collectionsPerProviderHour! * K.contributionMargin,
      6,
    );
    expect(d.contributionPerProviderHour!).toBeLessThan(
      d.collectionsPerProviderHour!,
    );
  });

  it("computes outsourced billing as a percentage of collections", () => {
    expect(derive(base, K).billingCost).toBeCloseTo(2_000_000 * 0.06, 6);
  });

  it("computes in-house billing as loaded labour cost", () => {
    const d = derive(
      { ...base, billingModel: "in_house", billingPercent: null, billingFte: 2 },
      K,
    );
    expect(d.billingCost).toBeCloseTo(2 * K.billingStaffLoadedHourlyCost * 2080, 6);
  });

  it("sums both sides for a hybrid billing model", () => {
    const d = derive(
      { ...base, billingModel: "hybrid", billingPercent: 3, billingFte: 1 },
      K,
    );
    expect(d.billingCost).toBeCloseTo(
      2_000_000 * 0.03 + 1 * K.billingStaffLoadedHourlyCost * 2080,
      6,
    );
  });

  it("derives no-show slots from kept visits, not from visits directly", () => {
    // 10% of *booked* slots are missed, so booked = visits / 0.9.
    const d = derive({ ...base, noShowRate: 10 }, K);
    const visits = 25 * 2 * 184;
    expect(d.noShowVisitsPerYear).toBeCloseTo((visits / 0.9) * 0.1, 4);
  });

  it("splits handled from unanswered calls", () => {
    const d = derive({ ...base, callsPerDay: 200, unansweredCallPercent: 25 }, K);
    expect(d.unansweredCallsPerDay).toBe(50);
    expect(d.handledCallsPerDay).toBe(150);
    expect(d.callHoursPerDay).toBeCloseTo((150 * K.callHandleMinutes) / 60, 6);
  });

  it("treats calls with no answer-rate given as all handled", () => {
    const d = derive({ ...base, callsPerDay: 200 }, K);
    expect(d.handledCallsPerDay).toBe(200);
  });
});

describe("derive — missing data", () => {
  it("returns nulls rather than NaN or zero when nothing is known", () => {
    const d = derive(EMPTY_ANSWERS, K);
    for (const [key, value] of Object.entries(d)) {
      expect(value === null || Number.isFinite(value), `${key} = ${value}`).toBe(true);
    }
    expect(d.collectionsPerVisit).toBeNull();
    expect(d.contributionPerProviderHour).toBeNull();
  });

  it("does not divide by zero when a denominator is zero", () => {
    const d = derive(
      { ...base, physicians: 0, apps: 0, frontOfficeFte: 0, callsPerDay: 100 },
      K,
    );
    expect(d.collectionsPerPhysician).toBeNull();
    expect(d.callsPerFrontOfficeFtePerDay).toBeNull();
    expect(d.collectionsPerProviderHour).toBeNull();
  });

  it("still sums the overhead components it does have", () => {
    const d = derive({ ...base, softwareSpendPerMonth: null }, K);
    expect(d.softwareCost).toBeNull();
    expect(d.identifiedOverhead).toBeCloseTo(
      d.frontOfficeCost! + d.clinicalStaffCost! + d.billingCost!,
      6,
    );
  });

  it("never produces a no-show value when the rate is 100%", () => {
    const d = derive({ ...base, noShowRate: 100 }, K);
    expect(d.noShowVisitsPerYear).toBeNull();
  });
});

describe("derive — assumption sensitivity", () => {
  it("raises hourly value when the contribution margin rises", () => {
    const low = derive(base, { ...K, contributionMargin: 0.4 });
    const high = derive(base, { ...K, contributionMargin: 0.7 });
    expect(high.contributionPerProviderHour!).toBeGreaterThan(
      low.contributionPerProviderHour!,
    );
  });

  it("raises collections per hour when clinic weeks fall", () => {
    const many = derive(base, { ...K, clinicalWeeksPerYear: 50 });
    const few = derive(base, { ...K, clinicalWeeksPerYear: 42 });
    expect(few.collectionsPerProviderHour!).toBeGreaterThan(
      many.collectionsPerProviderHour!,
    );
  });

  it("collapses no-show value to zero when nothing is refillable", () => {
    const d = derive({ ...base, noShowRate: 15 }, { ...K, noShowRecaptureRate: 0 });
    expect(d.noShowRecoverableValue).toBe(0);
  });
});

describe("buildMetrics", () => {
  it("omits metrics it could not compute", () => {
    const metrics = buildMetrics(EMPTY_ANSWERS, K, derive(EMPTY_ANSWERS, K));
    expect(metrics).toHaveLength(0);
  });

  it("gives every surfaced metric a formula and a basis", () => {
    for (const profile of DEMO_PROFILES) {
      const d = derive(profile.answers, K);
      for (const m of buildMetrics(profile.answers, K, d)) {
        expect(m.value).not.toBeNull();
        expect(m.formula.length).toBeGreaterThan(10);
        expect(m.basis.length).toBeGreaterThan(0);
        expect(["high", "medium", "low"]).toContain(m.confidence);
      }
    }
  });

  it("describes the billing formula that matches the chosen model", () => {
    const find = (a: AuditAnswers) =>
      buildMetrics(a, K, derive(a, K)).find((m) => m.key === "billingCost")!;
    expect(find(base).formula).toContain("billing fee");
    expect(
      find({ ...base, billingModel: "in_house", billingPercent: null, billingFte: 2 })
        .formula,
    ).toContain("2,080");
  });
});
