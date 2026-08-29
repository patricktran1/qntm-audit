import { describe, expect, it } from "vitest";
import {
  isSessionId,
  newSessionId,
  readAttribution,
  sanitizeAttributionValue,
  formatAttribution,
} from "@/lib/pilot/attribution";
import {
  validateOutcomeWrite,
  validateSessionWrite,
  sanitizeAttribution,
  sanitizeAssumptionChanges,
} from "@/lib/pilot/validate";
import { NoopStore } from "@/lib/pilot/store";
import { buildSnapshot, opportunityBand } from "@/lib/pilot/snapshot";
import { sessionsCsv, outcomesCsv, csvCell } from "@/lib/pilot/export";
import { pilotGuidance } from "@/lib/pilot/guidance";
import {
  calibration,
  conversionBreakdowns,
  findingInsight,
  pilotHealth,
  verdictDistribution,
  formatRatio,
} from "@/lib/pilot/analyse";
import { runAudit } from "@/lib/engine/audit";
import { PRACTICE_FIXTURES } from "@/lib/engine/fixtures";
import { encodeAnswers } from "@/lib/share";
import { MODEL_VERSION } from "@/lib/engine/version";
import type { DiscoveryOutcome, PilotSession } from "@/lib/pilot/types";

/** Builds a plausible stored session from a fixture. */
function sessionFrom(
  fixtureId: string,
  overrides: Partial<PilotSession> = {},
): PilotSession {
  const fixture = PRACTICE_FIXTURES.find((f) => f.id === fixtureId)!;
  const result = runAudit(fixture.answers);
  return {
    sessionId: newSessionId(),
    completedAt: new Date().toISOString(),
    firstSeen: new Date().toISOString(),
    variant: "A",
    attribution: { source: "leaderm", campaign: "pilot" },
    entryMode: "direct",
    isDemo: false,
    isTest: false,
    durationMs: 240_000,
    snapshot: buildSnapshot(result),
    assumptionChanges: [],
    leadSubmittedAt: null,
    ctaClickedAt: null,
    report: encodeAnswers(fixture.answers),
    ...overrides,
  };
}

describe("session identity", () => {
  it("mints opaque ids that carry nothing personal", () => {
    const id = newSessionId();
    expect(isSessionId(id)).toBe(true);
    expect(id).toMatch(/^ps_[0-9a-f]{24}$/);
  });

  it("mints distinct ids", () => {
    const ids = new Set(Array.from({ length: 500 }, () => newSessionId()));
    expect(ids.size).toBe(500);
  });

  it("rejects anything that is not a session id", () => {
    for (const bad of [
      "",
      "ps_",
      "ps_xyz",
      "ps_0123456789abcdef0123456",
      "ps_0123456789ABCDEF01234567",
      "../../etc/passwd",
      null,
      42,
    ])
      expect(isSessionId(bad)).toBe(false);
  });
});

describe("attribution sanitisation", () => {
  it("reduces values to a conservative character set", () => {
    expect(sanitizeAttributionValue("Conference Follow-Up")).toBe(
      "conference-follow-up",
    );
    expect(sanitizeAttributionValue("  LeaDerm  ")).toBe("leaderm");
    expect(sanitizeAttributionValue("a/b?c=d")).toBe("a-b-c-d");
  });

  it("drops anything that could break a CSV or carry markup", () => {
    // Leading and trailing separators are stripped, so nothing survives that
    // could be read as markup.
    expect(sanitizeAttributionValue("<script>alert(1)</script>")).toBe(
      "script-alert-1-script",
    );
    expect(sanitizeAttributionValue("a,b")).toBe("a-b");
    expect(sanitizeAttributionValue('"quoted"')).toBe("quoted");
    expect(sanitizeAttributionValue("\n\r\t")).toBeUndefined();
  });

  it("bounds length so a URL cannot stuff the dashboard", () => {
    const long = sanitizeAttributionValue("x".repeat(500));
    expect(long!.length).toBeLessThanOrEqual(48);
  });

  it("ignores non-strings and empty results", () => {
    for (const bad of [null, undefined, 42, {}, "---", "!!!"])
      expect(sanitizeAttributionValue(bad)).toBeUndefined();
  });

  it("reads only the four supported keys", () => {
    const params = new URLSearchParams(
      "source=email&campaign=derm&cohort=first10&ref=abc&utm_evil=x&other=y",
    );
    const a = readAttribution(params);
    expect(a).toEqual({
      source: "email",
      campaign: "derm",
      cohort: "first10",
      ref: "abc",
    });
    expect(Object.keys(a)).toHaveLength(4);
  });

  it("formats stably for display and export", () => {
    expect(formatAttribution({ source: "a", cohort: "b" })).toBe(
      "source=a cohort=b",
    );
    expect(formatAttribution({})).toBe("—");
  });

  it("sanitises attribution arriving as a JSON body", () => {
    expect(
      sanitizeAttribution({ source: "LeaDerm", campaign: 42, evil: "x" }),
    ).toEqual({ source: "leaderm" });
  });
});

describe("session write validation", () => {
  const valid = {
    sessionId: newSessionId(),
    report: encodeAnswers(PRACTICE_FIXTURES[0]!.answers),
    variant: "A",
    attribution: { source: "leaderm" },
    entryMode: "direct",
    isDemo: false,
    durationMs: 200_000,
    firstSeen: new Date().toISOString(),
    assumptionChanges: [],
  };

  it("accepts a well-formed write", () => {
    expect(validateSessionWrite(valid).ok).toBe(true);
  });

  it("rejects a forged or malformed session id", () => {
    for (const sessionId of ["", "abc", "ps_zz", null, 42]) {
      const r = validateSessionWrite({ ...valid, sessionId });
      expect(r.ok).toBe(false);
    }
  });

  it("rejects a write with no report to recompute from", () => {
    expect(validateSessionWrite({ ...valid, report: "" }).ok).toBe(false);
  });

  it("coerces an implausible duration to null rather than storing it", () => {
    for (const durationMs of [-5, 999_999_999, "abc", NaN]) {
      const r = validateSessionWrite({ ...valid, durationMs });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.durationMs).toBeNull();
    }
  });

  it("treats a demo entry mode as demo however isDemo is set", () => {
    const r = validateSessionWrite({ ...valid, entryMode: "demo", isDemo: false });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.isDemo).toBe(true);
  });

  it("drops assumption changes for keys that do not exist", () => {
    const changes = sanitizeAssumptionChanges([
      { key: "contributionMargin", from: 0.55, to: 0.4 },
      { key: "__proto__", from: 1, to: 2 },
      { key: "notAnAssumption", from: 1, to: 2 },
      { key: "contributionMargin", from: "x", to: "y" },
      "garbage",
    ]);
    expect(changes).toHaveLength(1);
    expect(changes[0]!.key).toBe("contributionMargin");
    expect(changes[0]!.direction).toBe("down");
  });

  it("bounds how many assumption changes a single write may carry", () => {
    const many = Array.from({ length: 200 }, () => ({
      key: "contributionMargin",
      from: 0.55,
      to: 0.4,
    }));
    expect(sanitizeAssumptionChanges(many).length).toBeLessThanOrEqual(40);
  });
});

describe("outcome write validation", () => {
  it("coerces every unknown enum to a safe default", () => {
    const r = validateOutcomeWrite({
      sessionId: newSessionId(),
      callOutcome: "'; DROP TABLE",
      auditAccuracy: "<script>",
      actualPain: "MADE UP",
      economicReaction: 42,
      serviceRelevant: "Free consulting",
      nextAction: null,
      mostChallengedAssumption: "notAKey",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.callOutcome).toBe("no_call_yet");
    expect(r.value.auditAccuracy).toBe("unable_to_determine");
    expect(r.value.actualPain).toBe("other");
    expect(r.value.economicReaction).toBe("not_discussed");
    expect(r.value.serviceRelevant).toBe("none");
    expect(r.value.nextAction).toBe("none");
    expect(r.value.mostChallengedAssumption).toBe("");
  });

  it("bounds operator notes", () => {
    const r = validateOutcomeWrite({
      sessionId: newSessionId(),
      whyBuy: "x".repeat(5000),
      whyNotBuy: "y".repeat(5000),
      nextActionNote: "z".repeat(5000),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.whyBuy.length).toBeLessThanOrEqual(600);
    expect(r.value.whyNotBuy.length).toBeLessThanOrEqual(600);
    expect(r.value.nextActionNote.length).toBeLessThanOrEqual(600);
  });

  it("refuses an outcome that cannot be joined to a session", () => {
    expect(validateOutcomeWrite({ sessionId: "not-a-session" }).ok).toBe(false);
  });

  it("keeps a real assumption key when one is given", () => {
    const r = validateOutcomeWrite({
      sessionId: newSessionId(),
      mostChallengedAssumption: "contributionMargin",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.mostChallengedAssumption).toBe("contributionMargin");
  });
});

describe("no-op store keeps the product working", () => {
  const store = new NoopStore();

  it("reports itself unconfigured", () => {
    expect(store.configured).toBe(false);
    expect(store.kind).toBe("noop");
  });

  it("accepts session writes silently so an audit never fails", async () => {
    expect((await store.putSession()).ok).toBe(true);
    expect((await store.markSession()).ok).toBe(true);
  });

  it("refuses outcome writes rather than pretending to save", async () => {
    // An operator must never believe a call outcome was recorded when it was
    // discarded — that is worse than the feature being unavailable.
    const result = await store.putOutcome();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no pilot store/i);
  });

  it("reads back empty", async () => {
    expect(await store.readAll()).toEqual({ sessions: [], outcomes: [] });
  });
});

describe("snapshot", () => {
  it("bands opportunity relative to collections", () => {
    expect(opportunityBand(0, 1_000_000)).toBe("none");
    expect(opportunityBand(5_000, 1_000_000)).toBe("<1%");
    expect(opportunityBand(20_000, 1_000_000)).toBe("1-3%");
    expect(opportunityBand(500_000, 1_000_000)).toBe("12%+");
    expect(opportunityBand(50_000, null)).toBe("unknown");
  });

  it("captures every finding category, not only the leading one", () => {
    const snap = buildSnapshot(runAudit(PRACTICE_FIXTURES[5]!.answers));
    expect(snap.findingCategories.length).toBeGreaterThan(1);
    expect(snap.findingCategories).toContain(snap.topCategory);
  });
});

describe("analysis excludes demo traffic from learning", () => {
  const sessions = [
    sessionFrom("efficient-solo"),
    sessionFrom("physician-admin-overload"),
    sessionFrom("access-constrained", { isDemo: true }),
    sessionFrom("large-group", { isDemo: true }),
  ];

  it("counts only real practices in pilot health", () => {
    const health = pilotHealth(sessions);
    expect(health.completedAudits).toBe(2);
    expect(health.demoSessions).toBe(2);
  });

  it("excludes demos from the verdict distribution", () => {
    expect(verdictDistribution(sessions).total).toBe(2);
  });

  it("excludes demos from finding frequency", () => {
    const leading = findingInsight(sessions).leading;
    const total = leading.reduce((s, l) => s + l.count, 0);
    expect(total).toBeLessThanOrEqual(2);
  });

  it("excludes demos from conversion breakdowns", () => {
    const rows = conversionBreakdowns(sessions).byVerdict;
    expect(rows.reduce((s, r) => s + r.sessions, 0)).toBe(2);
  });
});

describe("statistical honesty", () => {
  it("always renders a numerator and a denominator", () => {
    expect(formatRatio({ numerator: 3, denominator: 7 })).toBe("3 / 7 (43%)");
    expect(formatRatio({ numerator: 0, denominator: 0 })).toBe("0 / 0");
  });

  it("does not raise a sales-bias warning on a tiny sample", () => {
    // Every one of these is `act`, but three practices prove nothing.
    const sessions = [
      sessionFrom("physician-admin-overload"),
      sessionFrom("large-group"),
      sessionFrom("revenue-cycle-problem"),
    ];
    expect(verdictDistribution(sessions).integrityWarning).toBeNull();
  });

  it("raises a sales-bias warning once the sample supports it", () => {
    const sessions = Array.from({ length: 12 }, () =>
      sessionFrom("physician-admin-overload"),
    );
    const warning = verdictDistribution(sessions).integrityWarning;
    expect(warning).toBeTruthy();
    expect(warning).toMatch(/healthy|sales tool/i);
  });

  it("raises a detector-dominance warning only with enough leaders", () => {
    const few = Array.from({ length: 4 }, () => sessionFrom("physician-admin-overload"));
    expect(findingInsight(few).dominanceWarning).toBeNull();
    const many = Array.from({ length: 12 }, () =>
      sessionFrom("physician-admin-overload"),
    );
    expect(findingInsight(many).dominanceWarning).toMatch(/leads/i);
  });
});

describe("guidance is deterministic and always evidenced", () => {
  it("blocks on sample size first", () => {
    const g = pilotGuidance([sessionFrom("efficient-solo")], []);
    expect(g[0]!.id).toBe("sample-too-small");
    expect(g[0]!.severity).toBe("blocking");
  });

  it("attaches evidence to every recommendation", () => {
    const sessions = Array.from({ length: 14 }, () =>
      sessionFrom("physician-admin-overload"),
    );
    for (const item of pilotGuidance(sessions, [])) {
      expect(item.evidence.length).toBeGreaterThan(10);
      expect(item.action.length).toBeGreaterThan(10);
    }
  });

  it("flags a sales-biased distribution as blocking", () => {
    const sessions = Array.from({ length: 14 }, () =>
      sessionFrom("physician-admin-overload"),
    );
    const ids = pilotGuidance(sessions, []).map((g) => g.id);
    expect(ids).toContain("verdict-integrity");
  });

  it("flags the absence of discovery outcomes once audits exist", () => {
    const sessions = Array.from({ length: 12 }, () => sessionFrom("access-constrained"));
    expect(pilotGuidance(sessions, []).map((g) => g.id)).toContain("no-outcomes");
  });

  it("returns something rather than nothing when no rule fires", () => {
    const g = pilotGuidance([], []);
    expect(g.length).toBeGreaterThan(0);
  });

  it("produces identical output for identical input", () => {
    const sessions = Array.from({ length: 12 }, () => sessionFrom("large-group"));
    expect(JSON.stringify(pilotGuidance(sessions, []))).toBe(
      JSON.stringify(pilotGuidance(sessions, [])),
    );
  });
});

describe("calibration", () => {
  const session = sessionFrom("revenue-cycle-problem");
  const outcome: DiscoveryOutcome = {
    sessionId: session.sessionId,
    recordedAt: new Date().toISOString(),
    modelVersion: MODEL_VERSION,
    callOutcome: "qualified",
    auditAccuracy: "confirmed",
    actualPain: "REVENUE OPERATIONS",
    economicReaction: "credible",
    mostChallengedAssumption: "contributionMargin",
    whyBuy: "",
    whyNotBuy: "",
    serviceRelevant: "Revenue cycle optimization",
    nextAction: "second_call",
    nextActionNote: "",
  };

  it("pairs an outcome with its session", () => {
    const c = calibration([session], [outcome]);
    expect(c.labelled).toBe(1);
    expect(c.comparable).toBe(1);
    expect(c.agreement.numerator).toBe(1);
  });

  it("ignores an outcome with no matching session", () => {
    const c = calibration([], [outcome]);
    expect(c.labelled).toBe(0);
  });

  it("excludes calls that never happened from the agreement rate", () => {
    const c = calibration(
      [session],
      [{ ...outcome, callOutcome: "no_call_yet" }],
    );
    expect(c.labelled).toBe(1);
    expect(c.comparable).toBe(0);
  });

  it("records a disagreement in the confusion table", () => {
    const c = calibration(
      [session],
      [{ ...outcome, actualPain: "FRONT OFFICE", auditAccuracy: "incorrect" }],
    );
    expect(c.agreement.numerator).toBe(0);
    expect(c.confusion[0]).toMatchObject({
      predicted: "REVENUE OPERATIONS",
      actual: "FRONT OFFICE",
    });
  });

  it("counts a service false positive when nothing was relevant", () => {
    const c = calibration([session], [{ ...outcome, serviceRelevant: "none" }]);
    expect(c.serviceFalsePositives[0]?.count).toBe(1);
    expect(c.serviceAgreement.numerator).toBe(0);
  });
});

describe("CSV export", () => {
  const sessions = [
    sessionFrom("physician-admin-overload", { leadSubmittedAt: new Date().toISOString() }),
  ];

  it("neutralises a value a spreadsheet would execute", () => {
    expect(csvCell("=1+1")).toBe(`"'=1+1"`);
    expect(csvCell("+cmd")).toBe(`"'+cmd"`);
    expect(csvCell("@SUM")).toBe(`"'@SUM"`);
    expect(csvCell('say "hi"')).toBe(`"say ""hi"""`);
  });

  it("emits stable columns", () => {
    const header = sessionsCsv(sessions).split("\r\n")[0]!;
    expect(header).toContain('"session_id"');
    expect(header).toContain('"model_version"');
    expect(header).toContain('"verdict"');
    expect(header).toContain('"source"');
  });

  it("carries bands, never raw practice financials", () => {
    const csv = sessionsCsv(sessions);
    expect(csv).not.toContain("5200000");
    expect(csv).toContain("3-6M");
  });

  it("keeps the encoded answers out of the default export", () => {
    // The report string contains the practice's raw operating figures. It is
    // useful for reopening an audit and has no place in an analysis file that
    // travels between machines.
    const analytical = sessionsCsv(sessions);
    expect(analytical).not.toContain(sessions[0]!.report);
    expect(analytical.split("\r\n")[0]).not.toContain('"report"');

    const full = sessionsCsv(sessions, true);
    expect(full).toContain(sessions[0]!.report);
    expect(full.split("\r\n")[0]).toContain('"report"');
  });

  it("contains no contact information", () => {
    const csv = sessionsCsv(sessions).toLowerCase();
    // Substrings that would indicate a person rather than a practice metric.
    for (const forbidden of ["email", "@", "mailto", "tel:"])
      expect(csv.includes(forbidden), `CSV contained "${forbidden}"`).toBe(false);
  });

  it("omits operator notes unless they are explicitly requested", () => {
    const outcome: DiscoveryOutcome = {
      sessionId: sessions[0]!.sessionId,
      recordedAt: new Date().toISOString(),
      modelVersion: MODEL_VERSION,
      callOutcome: "spoke",
      auditAccuracy: "confirmed",
      actualPain: "PHYSICIAN TIME",
      economicReaction: "credible",
      mostChallengedAssumption: "",
      whyBuy: "SECRET NOTE",
      whyNotBuy: "",
      serviceRelevant: "none",
      nextAction: "none",
      nextActionNote: "",
    };
    expect(outcomesCsv([outcome], sessions, false)).not.toContain("SECRET NOTE");
    expect(outcomesCsv([outcome], sessions, true)).toContain("SECRET NOTE");
  });

  it("marks agreement between predicted and actual pain", () => {
    const outcome: DiscoveryOutcome = {
      sessionId: sessions[0]!.sessionId,
      recordedAt: new Date().toISOString(),
      modelVersion: MODEL_VERSION,
      callOutcome: "spoke",
      auditAccuracy: "confirmed",
      actualPain: "PHYSICIAN TIME",
      economicReaction: "credible",
      mostChallengedAssumption: "",
      whyBuy: "",
      whyNotBuy: "",
      serviceRelevant: "none",
      nextAction: "none",
      nextActionNote: "",
    };
    expect(outcomesCsv([outcome], sessions, false)).toContain('"match"');
  });
});
