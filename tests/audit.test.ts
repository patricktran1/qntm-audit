import { describe, expect, it } from "vitest";
import { runAudit } from "@/lib/engine/audit";
import { DEFAULT_ASSUMPTIONS } from "@/lib/engine/assumptions";
import { EMPTY_ANSWERS, completeness } from "@/lib/engine/questions";
import { DEMO_PROFILES } from "@/lib/engine/profiles";
import { bucketFor, rankScore, significance } from "@/lib/engine/prioritize";
import { buildBrief } from "@/lib/engine/brief";
import type { AuditAnswers } from "@/lib/engine/types";

describe("runAudit — determinism and safety", () => {
  it("produces identical output for identical input", () => {
    const a = runAudit(DEMO_PROFILES[0]!.answers);
    const b = runAudit(DEMO_PROFILES[0]!.answers);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("survives a completely empty audit without throwing", () => {
    const r = runAudit(EMPTY_ANSWERS);
    expect(r.score.overall).toBeNull();
    expect(r.findings).toEqual([]);
    expect(r.metrics).toEqual([]);
    expect(r.opportunityLow).toBe(0);
    expect(r.executiveSummary.length).toBeGreaterThan(0);
    expect(r.openQuestions.length).toBeGreaterThan(0);
    expect(r.plan.length).toBeGreaterThan(0);
  });

  it("never emits NaN in a headline number", () => {
    for (const profile of DEMO_PROFILES) {
      const r = runAudit(profile.answers);
      expect(Number.isFinite(r.opportunityLow)).toBe(true);
      expect(Number.isFinite(r.opportunityHigh)).toBe(true);
      expect(Number.isFinite(r.oneTimeLow)).toBe(true);
      const text = [...r.executiveSummary, ...r.findings.map((f) => f.headline)].join(" ");
      expect(text).not.toMatch(/NaN|Infinity|undefined|\bnull\b/);
    }
  });

  it("handles a practice with every optional field skipped", () => {
    const sparse: AuditAnswers = {
      ...EMPTY_ANSWERS,
      physicians: 1,
      apps: 0,
      annualCollections: 900_000,
      clinicalDaysPerWeek: 4,
      patientsPerProviderPerDay: 24,
      frontOfficeFte: 2,
      clinicalStaffFte: 2,
      billingModel: "in_house",
    };
    const r = runAudit(sparse);
    expect(r.score.overall).not.toBeNull();
    expect(r.score.coverage).toBeLessThan(1);
    expect(r.openQuestions.length).toBeGreaterThanOrEqual(4);
    const text = r.findings.map((f) => f.headline).join(" ");
    expect(text).not.toMatch(/NaN|undefined/);
  });

  it("treats zeroes as answers, not as skips", () => {
    const a: AuditAnswers = {
      ...DEMO_PROFILES[0]!.answers,
      noShowRate: 0,
      unansweredCallPercent: 0,
      priorAuthStaffHoursPerWeek: 0,
    };
    const r = runAudit(a);
    expect(completeness(a)).toBe(1);
    expect(r.findings.some((f) => f.id === "no-show-leakage")).toBe(false);
    expect(r.findings.some((f) => f.id === "prior-auth-load")).toBe(false);
    // The "we don't know your rate" prompt must go. A follow-up question about
    // rebooking behaviour is still fair game — it asks something new.
    expect(
      r.openQuestions.some((q) => /What is your no-show/i.test(q.question)),
    ).toBe(false);
  });
});

describe("runAudit — economic integrity", () => {
  it("keeps one-time cash out of the recurring annual range", () => {
    const r = runAudit(DEMO_PROFILES[1]!.answers);
    const ar = r.findings.find((f) => f.id === "ar-aging");
    expect(ar?.estimate?.recurrence).toBe("one_time");
    expect(r.oneTimeHigh).toBeGreaterThan(0);
    // The A/R figure must not appear inside the annual total.
    expect(r.opportunityHigh).toBeLessThan(r.opportunityHigh + r.oneTimeHigh);
    const annualIds = r.findings
      .filter((f) => f.estimate?.recurrence === "annual")
      .map((f) => f.id);
    expect(annualIds).not.toContain("ar-aging");
  });

  it("never counts money the practice already spends as opportunity", () => {
    for (const profile of DEMO_PROFILES) {
      const r = runAudit(profile.answers);
      const counted = r.findings.filter(
        (f) => f.estimate && f.estimate.kind !== "current_cost",
      );
      const sum = counted
        .filter((f) => f.estimate!.recurrence === "annual")
        .reduce((s, f) => s + f.estimate!.high, 0);
      expect(r.opportunityHigh).toBeCloseTo(sum, 4);
    }
  });

  it("gives every estimate a low bound at or below its high bound", () => {
    for (const profile of DEMO_PROFILES) {
      for (const f of runAudit(profile.answers).findings) {
        if (!f.estimate) continue;
        expect(f.estimate.low).toBeLessThanOrEqual(f.estimate.high);
        expect(f.estimate.low).toBeGreaterThanOrEqual(0);
        expect(f.estimate.assumptions.length).toBeGreaterThan(0);
        expect(f.estimate.formula.length).toBeGreaterThan(10);
      }
    }
  });

  it("scales the opportunity with the assumptions it depends on", () => {
    const answers = DEMO_PROFILES[2]!.answers;
    const conservative = runAudit(answers, {
      ...DEFAULT_ASSUMPTIONS,
      contributionMargin: 0.35,
    });
    const generous = runAudit(answers, {
      ...DEFAULT_ASSUMPTIONS,
      contributionMargin: 0.75,
    });
    expect(generous.opportunityHigh).toBeGreaterThan(conservative.opportunityHigh);
  });

  it("collapses no-show value to nothing when slots cannot be refilled", () => {
    const r = runAudit(DEMO_PROFILES[0]!.answers, {
      ...DEFAULT_ASSUMPTIONS,
      noShowRecaptureRate: 0,
    });
    const noShow = r.findings.find((f) => f.id === "no-show-leakage");
    expect(noShow?.estimate?.high).toBe(0);
  });

  it("scales impact to practice size rather than to raw dollars", () => {
    // Same operational problem, ten times the practice. The finding should not
    // become "high impact" purely because the practice is larger.
    const small = runAudit({
      ...EMPTY_ANSWERS,
      physicians: 1,
      apps: 0,
      annualCollections: 800_000,
      clinicalDaysPerWeek: 4,
      patientsPerProviderPerDay: 24,
      frontOfficeFte: 2,
      clinicalStaffFte: 2,
      billingModel: "outsourced",
      billingPercent: 6,
      softwareSpendPerMonth: 2_000,
    });
    const large = runAudit({
      ...EMPTY_ANSWERS,
      physicians: 10,
      apps: 0,
      annualCollections: 8_000_000,
      clinicalDaysPerWeek: 4,
      patientsPerProviderPerDay: 24,
      frontOfficeFte: 20,
      clinicalStaffFte: 20,
      billingModel: "outsourced",
      billingPercent: 6,
      softwareSpendPerMonth: 20_000,
    });
    const s = small.findings.find((f) => f.id === "software-stack");
    const l = large.findings.find((f) => f.id === "software-stack");
    expect(s?.impact).toBe(l?.impact);
  });
});

describe("runAudit — report structure", () => {
  it("returns at most four top opportunities, none of them low priority", () => {
    for (const profile of DEMO_PROFILES) {
      const r = runAudit(profile.answers);
      expect(r.topOpportunities.length).toBeGreaterThanOrEqual(3);
      expect(r.topOpportunities.length).toBeLessThanOrEqual(4);
      for (const f of r.topOpportunities) expect(f.bucket).not.toBe("low_priority");
    }
  });

  it("leads with the most significant finding, not the easiest one", () => {
    for (const profile of DEMO_PROFILES) {
      const r = runAudit(profile.answers);
      const best = Math.max(
        ...r.findings.map((f) => significance(f, profile.answers.annualCollections)),
      );
      expect(
        significance(r.topOpportunities[0]!, profile.answers.annualCollections),
      ).toBeCloseTo(best, 6);
    }
  });

  it("does not return four versions of the same problem", () => {
    for (const profile of DEMO_PROFILES) {
      const cats = runAudit(profile.answers).topOpportunities.map((f) => f.category);
      expect(new Set(cats).size).toBe(cats.length);
    }
  });

  it("caps automation candidates at three and derives each from a finding", () => {
    for (const profile of DEMO_PROFILES) {
      const r = runAudit(profile.answers);
      expect(r.automationCandidates.length).toBeLessThanOrEqual(3);
      for (const c of r.automationCandidates) {
        expect(c.trigger.length).toBeGreaterThan(10);
        expect(c.readiness.length).toBeGreaterThan(20);
      }
    }
  });

  it("asks about every metric the practice could not report", () => {
    const sparse: AuditAnswers = {
      ...DEMO_PROFILES[0]!.answers,
      daysInAR: null,
      noShowRate: null,
      callsPerDay: null,
    };
    const questions = runAudit(sparse).openQuestions.map((q) => q.question).join(" ");
    expect(questions).toMatch(/A\/R/);
    expect(questions).toMatch(/calls/i);
    expect(questions).toMatch(/no-show/i);
  });

  it("gives every finding an evidence trail and a next step", () => {
    for (const profile of DEMO_PROFILES) {
      for (const f of runAudit(profile.answers).findings) {
        expect(f.evidence.length).toBeGreaterThan(1);
        expect(f.nextStep.length).toBeGreaterThan(30);
        expect(f.evidence.some((e) => e.reported)).toBe(true);
      }
    }
  });

  it("builds a 30-day plan that starts with measurement", () => {
    const r = runAudit(DEMO_PROFILES[0]!.answers);
    expect(r.plan.length).toBeGreaterThanOrEqual(4);
    expect(r.plan[0]!.week).toBe("Week 1");
    expect(r.plan.at(-1)!.week).toBe("Week 4");
  });
});

describe("prioritize", () => {
  it("routes low-confidence findings to measurement, never to a project", () => {
    expect(bucketFor("high", "low", "low")).toBe("monitor");
    expect(bucketFor("high", "high", "low")).toBe("monitor");
    expect(bucketFor("low", "low", "low")).toBe("low_priority");
  });

  it("calls a confident, cheap, material finding a quick win", () => {
    expect(bucketFor("high", "low", "high")).toBe("quick_win");
    expect(bucketFor("medium", "low", "medium")).toBe("quick_win");
  });

  it("calls a confident, expensive, material finding a strategic bet", () => {
    expect(bucketFor("high", "high", "high")).toBe("strategic_bet");
    expect(bucketFor("high", "medium", "medium")).toBe("strategic_bet");
  });

  it("penalises effort in rank but not in significance", () => {
    const cheap = { impact: "high", effort: "low", confidence: "high", estimate: null } as never;
    const dear = { impact: "high", effort: "high", confidence: "high", estimate: null } as never;
    expect(rankScore(cheap, 1_000_000)).toBeGreaterThan(rankScore(dear, 1_000_000));
    expect(significance(cheap, 1_000_000)).toBe(significance(dear, 1_000_000));
  });

  it("orders quick wins ahead of strategic bets ahead of measurement", () => {
    const r = runAudit(DEMO_PROFILES[1]!.answers);
    const order = ["quick_win", "strategic_bet", "monitor", "low_priority"];
    const indices = r.findings.map((f) => order.indexOf(f.bucket));
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });
});

describe("buildBrief", () => {
  it("reflects the audit rather than inventing a pitch", () => {
    for (const profile of DEMO_PROFILES) {
      const r = runAudit(profile.answers);
      const b = buildBrief(r);
      expect(b.highestPain).toBe(r.topOpportunities[0]!.title);
      expect(b.serviceFit.length).toBeGreaterThan(3);
      expect(b.discoveryQuestions.length).toBeGreaterThanOrEqual(5);
      expect(b.recommendedConversation).not.toMatch(/undefined|NaN/);
    }
  });

  it("sorts strong service fits first", () => {
    const b = buildBrief(runAudit(DEMO_PROFILES[1]!.answers));
    const order = ["strong", "possible", "weak"];
    const idx = b.serviceFit.map((s) => order.indexOf(s.fit));
    expect(idx).toEqual([...idx].sort((a, b2) => a - b2));
  });

  it("flags a thin audit as a disqualifier instead of overselling it", () => {
    const b = buildBrief(
      runAudit({
        ...EMPTY_ANSWERS,
        physicians: 1,
        apps: 0,
        annualCollections: 500_000,
        clinicalDaysPerWeek: 3,
        patientsPerProviderPerDay: 18,
        frontOfficeFte: 1,
        clinicalStaffFte: 1,
        billingModel: "in_house",
      }),
    );
    expect(b.disqualifiers.join(" ")).toMatch(/answered|solo|below the cost/i);
  });

  it("tells the salesperson to stand down on a tight practice", () => {
    const tight: AuditAnswers = {
      ...EMPTY_ANSWERS,
      physicians: 2,
      apps: 2,
      annualCollections: 4_000_000,
      clinicalDaysPerWeek: 4,
      patientsPerProviderPerDay: 30,
      frontOfficeFte: 3,
      clinicalStaffFte: 4,
      billingModel: "outsourced",
      billingPercent: 3,
      noShowRate: 2,
      callsPerDay: 120,
      unansweredCallPercent: 2,
      thirdNextAvailableDays: 5,
      physicianAdminHoursPerWeek: 3,
      priorAuthStaffHoursPerWeek: 2,
      daysInAR: 22,
      softwareSpendPerMonth: 2_500,
    };
    const r = runAudit(tight);
    expect(r.score.overall!).toBeGreaterThan(78);
    expect(buildBrief(r).disqualifiers.join(" ")).toMatch(/running well|Score is high/i);
  });
});
