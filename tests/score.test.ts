import { describe, expect, it } from "vitest";
import { bandFor, computeScore, scoreFromAnchors } from "@/lib/engine/score";
import { derive } from "@/lib/engine/derive";
import { DEFAULT_ASSUMPTIONS } from "@/lib/engine/assumptions";
import { EMPTY_ANSWERS } from "@/lib/engine/questions";
import { DEMO_PROFILES } from "@/lib/engine/profiles";
import type { AuditAnswers } from "@/lib/engine/types";

const K = DEFAULT_ASSUMPTIONS;
const score = (a: AuditAnswers) => computeScore(a, K, derive(a, K));

describe("scoreFromAnchors", () => {
  const anchors: [number, number][] = [
    [0, 100],
    [10, 60],
    [20, 0],
  ];

  it("returns the endpoint score below the first anchor", () => {
    expect(scoreFromAnchors(-5, anchors)).toBe(100);
  });

  it("returns the endpoint score above the last anchor", () => {
    expect(scoreFromAnchors(999, anchors)).toBe(0);
  });

  it("hits anchor values exactly", () => {
    expect(scoreFromAnchors(10, anchors)).toBe(60);
  });

  it("interpolates linearly between anchors", () => {
    expect(scoreFromAnchors(5, anchors)).toBe(80);
    expect(scoreFromAnchors(15, anchors)).toBe(30);
  });

  it("is monotonically non-increasing for a descending curve", () => {
    let prev = Infinity;
    for (let v = 0; v <= 25; v += 0.5) {
      const s = scoreFromAnchors(v, anchors);
      expect(s).toBeLessThanOrEqual(prev + 1e-9);
      prev = s;
    }
  });

  it("never returns a value outside the anchor range", () => {
    for (let v = -50; v <= 100; v += 1) {
      const s = scoreFromAnchors(v, anchors);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
  });

  it("handles an empty anchor set without throwing", () => {
    expect(scoreFromAnchors(5, [])).toBe(0);
  });
});

describe("computeScore", () => {
  it("returns null overall when nothing was answered", () => {
    const s = score(EMPTY_ANSWERS);
    expect(s.overall).toBeNull();
    expect(s.band).toBe("Not scored");
    expect(s.coverage).toBe(0);
  });

  it("scores every dimension for a fully answered practice", () => {
    for (const profile of DEMO_PROFILES) {
      const s = score(profile.answers);
      expect(s.scoredCount).toBe(s.totalCount);
      expect(s.coverage).toBeCloseTo(1, 5);
      expect(s.overall).not.toBeNull();
      expect(s.overall!).toBeGreaterThanOrEqual(0);
      expect(s.overall!).toBeLessThanOrEqual(100);
    }
  });

  it("only counts weight from dimensions it could actually score", () => {
    const partial: AuditAnswers = {
      ...EMPTY_ANSWERS,
      physicians: 2,
      apps: 0,
      annualCollections: 2_000_000,
      clinicalDaysPerWeek: 4,
      patientsPerProviderPerDay: 25,
      noShowRate: 8,
    };
    const s = score(partial);
    expect(s.overall).not.toBeNull();
    expect(s.coverage).toBeGreaterThan(0);
    expect(s.coverage).toBeLessThan(1);
    expect(s.scoredCount).toBeLessThan(s.totalCount);
  });

  it("labels unscored dimensions rather than silently scoring them zero", () => {
    const s = score(EMPTY_ANSWERS);
    for (const d of s.dimensions) {
      expect(d.score).toBeNull();
      expect(d.rationale).toMatch(/not scored/i);
    }
  });

  it("penalises a worse practice on the dimension that got worse", () => {
    const base: AuditAnswers = { ...DEMO_PROFILES[0]!.answers };
    const worse: AuditAnswers = { ...base, noShowRate: 30, thirdNextAvailableDays: 70 };
    const a = score(base).dimensions.find((d) => d.key === "access")!;
    const b = score(worse).dimensions.find((d) => d.key === "access")!;
    expect(b.score!).toBeLessThan(a.score!);
  });

  it("improving one input never lowers the overall score", () => {
    const base = DEMO_PROFILES[1]!.answers;
    const better: AuditAnswers = { ...base, daysInAR: 28 };
    expect(score(better).overall!).toBeGreaterThanOrEqual(score(base).overall!);
  });

  it("reports the band that matches the displayed rounded score", () => {
    for (const profile of DEMO_PROFILES) {
      const s = score(profile.answers);
      expect(s.band).toBe(bandFor(s.overall).band);
    }
  });

  it("treats zero as a real answer, not a missing one", () => {
    const zeroed: AuditAnswers = {
      ...DEMO_PROFILES[0]!.answers,
      noShowRate: 0,
      unansweredCallPercent: 0,
      physicianAdminHoursPerWeek: 0,
    };
    const s = score(zeroed);
    const access = s.dimensions.find((d) => d.key === "access")!;
    const time = s.dimensions.find((d) => d.key === "physician_time")!;
    expect(access.score).not.toBeNull();
    expect(time.score).toBe(100);
    expect(s.overall!).toBeGreaterThan(score(DEMO_PROFILES[0]!.answers).overall!);
  });

  it("scores in-house billing on the same curve as an outsourced fee", () => {
    const outsourced: AuditAnswers = {
      ...DEMO_PROFILES[0]!.answers,
      billingModel: "outsourced",
      billingPercent: 6,
      billingFte: null,
    };
    const inHouse: AuditAnswers = {
      ...DEMO_PROFILES[0]!.answers,
      billingModel: "in_house",
      billingPercent: null,
      // 0.53 FTE ≈ $33k ≈ 3% of $1.1M collections — cheaper than a 6% fee.
      billingFte: 0.53,
    };
    const o = score(outsourced).dimensions.find((d) => d.key === "revenue_ops")!;
    const i = score(inHouse).dimensions.find((d) => d.key === "revenue_ops")!;
    expect(i.score).not.toBeNull();
    expect(o.score).not.toBeNull();
    expect(i.score!).toBeGreaterThan(o.score!);
  });
});

describe("bandFor", () => {
  it("maps each range to a distinct band", () => {
    expect(bandFor(null).band).toBe("Not scored");
    expect(bandFor(85).band).toBe("Tight operation");
    expect(bandFor(70).band).toBe("Solid, with named gaps");
    expect(bandFor(55).band).toBe("Meaningful drag");
    expect(bandFor(30).band).toBe("Substantial leverage available");
  });

  it("uses inclusive lower bounds at each boundary", () => {
    expect(bandFor(80).band).toBe("Tight operation");
    expect(bandFor(79).band).toBe("Solid, with named gaps");
    expect(bandFor(65).band).toBe("Solid, with named gaps");
    expect(bandFor(64).band).toBe("Meaningful drag");
    expect(bandFor(50).band).toBe("Meaningful drag");
    expect(bandFor(49).band).toBe("Substantial leverage available");
  });
});
