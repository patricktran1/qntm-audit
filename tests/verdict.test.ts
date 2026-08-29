import { describe, expect, it } from "vitest";
import { runAudit } from "@/lib/engine/audit";
import { DEFAULT_ASSUMPTIONS } from "@/lib/engine/assumptions";
import { EMPTY_ANSWERS } from "@/lib/engine/questions";
import { DEMO_PROFILES } from "@/lib/engine/profiles";
import type { AuditAnswers } from "@/lib/engine/types";

const A = (o: Partial<AuditAnswers>): AuditAnswers => ({ ...EMPTY_ANSWERS, ...o });

/** A genuinely well-run solo practice. The audit must decline to sell to it. */
const HEALTHY = A({
  physicians: 1, apps: 1, annualCollections: 1_900_000, clinicalDaysPerWeek: 4,
  patientsPerProviderPerDay: 30, frontOfficeFte: 2, clinicalStaffFte: 3,
  billingModel: "outsourced", billingPercent: 4, noShowRate: 3,
  callsPerDay: 110, unansweredCallPercent: 4, thirdNextAvailableDays: 8,
  physicianAdminHoursPerWeek: 4, priorAuthStaffHoursPerWeek: 3,
  daysInAR: 26, softwareSpendPerMonth: 2_400,
});

/** A practice with real, confident, high-impact problems. */
const STRAINED = A({
  physicians: 4, apps: 2, annualCollections: 7_800_000, clinicalDaysPerWeek: 4.5,
  patientsPerProviderPerDay: 30, frontOfficeFte: 9, clinicalStaffFte: 12,
  billingModel: "outsourced", billingPercent: 6.5, noShowRate: 10,
  callsPerDay: 420, unansweredCallPercent: 19, thirdNextAvailableDays: 33,
  physicianAdminHoursPerWeek: 11, priorAuthStaffHoursPerWeek: 40,
  daysInAR: 49, softwareSpendPerMonth: 12_000,
});

/** Answered the required fields and skipped everything else. */
const SPARSE = A({
  physicians: 2, apps: 0, annualCollections: 2_600_000, clinicalDaysPerWeek: 4,
  patientsPerProviderPerDay: 28, frontOfficeFte: 4, clinicalStaffFte: 5,
  billingModel: "outsourced", billingPercent: 6,
});

describe("verdict — the audit must be able to say 'do not buy anything'", () => {
  it("calls a well-run practice healthy and declines to ask for the meeting", () => {
    const r = runAudit(HEALTHY);
    expect(r.verdict.level).toBe("healthy");
    expect(r.offer.posture).toBe("none");
    expect(r.verdict.detail).toMatch(/would not recommend/i);
    expect(r.offer.agenda).toEqual([]);
  });

  it("does not pitch automation to a healthy practice", () => {
    expect(runAudit(HEALTHY).automationCandidates).toEqual([]);
  });

  it("does not frame a healthy practice's small findings as an opportunity", () => {
    const summary = runAudit(HEALTHY).executiveSummary.join(" ");
    expect(summary).toMatch(/inside the noise|for completeness/i);
    expect(summary).not.toMatch(/The clearest signal is/);
  });

  it("recommends acting when there is a confident, high-impact finding", () => {
    const r = runAudit(STRAINED);
    expect(r.verdict.level).toBe("act");
    expect(r.offer.posture).toBe("standard");
    expect(r.offer.agenda.length).toBeGreaterThan(0);
  });

  it("withholds a verdict when the audit was barely completed", () => {
    const r = runAudit(SPARSE);
    expect(r.verdict.level).toBe("insufficient_data");
    expect(r.offer.posture).toBe("soft");
    expect(r.offer.primaryLabel).toMatch(/measure/i);
  });

  it("names the same finding the report leads with", () => {
    // A verdict that names a different finding than the one at the top of the
    // report reads as two documents stapled together.
    for (const answers of [STRAINED, ...DEMO_PROFILES.map((p) => p.answers)]) {
      const r = runAudit(answers);
      if (r.verdict.level !== "act") continue;
      expect(r.verdict.headline.toLowerCase()).toContain(
        r.topOpportunities[0]!.title.toLowerCase(),
      );
    }
  });

  it("never promises savings anywhere in the offer", () => {
    for (const answers of [HEALTHY, STRAINED, SPARSE, ...DEMO_PROFILES.map((p) => p.answers)]) {
      const o = runAudit(answers).offer;
      const text = [o.headline, o.body, o.footnote, ...o.agenda].join(" ");
      expect(text).not.toMatch(/guarantee|save you|savings|ROI|transform/i);
    }
  });

  it("keeps the CTA focused on the category the audit actually observed", () => {
    const r = runAudit(STRAINED);
    expect(r.offer.headline.toLowerCase()).toContain("review");
    // The agenda must belong to the leading finding's category.
    expect(r.offer.agenda.join(" ").length).toBeGreaterThan(40);
  });

  it("stays deterministic across assumption changes in level, if not in wording", () => {
    const hostile = runAudit(STRAINED, {
      ...DEFAULT_ASSUMPTIONS,
      contributionMargin: 0.3,
      noShowRecaptureRate: 0.1,
    });
    expect(hostile.verdict.level).toBe("act");
    expect(hostile.opportunityHigh).toBeLessThan(runAudit(STRAINED).opportunityHigh);
  });
});

describe("detector regressions found by red-teaming", () => {
  it("does not flag a light physician admin load as a finding", () => {
    // 4 hrs/week against 32 scheduled is 11% of the work week — a good result.
    // This previously fired and became the headline finding for every practice.
    const r = runAudit(HEALTHY);
    expect(r.findings.some((f) => f.id === "physician-admin-load")).toBe(false);
  });

  it("still flags a heavy physician admin load", () => {
    expect(
      runAudit(STRAINED).findings.some((f) => f.id === "physician-admin-load"),
    ).toBe(true);
  });

  it("scales the billing estimate to the excess over the reference rate", () => {
    const at6 = runAudit(A({ ...STRAINED, billingPercent: 6 }));
    const at11 = runAudit(A({ ...STRAINED, billingPercent: 11 }));
    const a = at6.findings.find((f) => f.id === "billing-cost");
    const b = at11.findings.find((f) => f.id === "billing-cost");
    expect(b?.estimate?.high).toBeGreaterThan(a?.estimate?.high ?? 0);
  });

  it("caps the billing estimate so an extreme rate cannot run away", () => {
    const extreme = runAudit(A({ ...STRAINED, billingPercent: 15 }));
    const f = extreme.findings.find((f) => f.id === "billing-cost")!;
    // Capped at 4 points of spread × 60% recoverable = 2.4% of collections.
    expect(f.estimate!.high).toBeLessThanOrEqual(7_800_000 * 0.024 + 1);
  });

  it("never recommends automating a finding it de-prioritised", () => {
    for (const answers of [STRAINED, ...DEMO_PROFILES.map((p) => p.answers)]) {
      const r = runAudit(answers);
      const lowPriority = new Set(
        r.findings.filter((f) => f.bucket === "low_priority").map((f) => f.id),
      );
      // Reminders come only from the no-show finding; documentation only from
      // the physician-time findings.
      if (lowPriority.has("no-show-leakage"))
        expect(r.automationCandidates.some((c) => c.workflow === "reminders_recalls")).toBe(false);
      if (lowPriority.has("prior-auth-load"))
        expect(r.automationCandidates.some((c) => c.workflow === "prior_auth")).toBe(false);
    }
  });
});
