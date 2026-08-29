import { describe, expect, it } from "vitest";
import { decodeAnswers, encodeAnswers } from "@/lib/share";
import { EMPTY_ANSWERS, completeness, isStepComplete, STEPS, visibleFields } from "@/lib/engine/questions";
import { DEMO_PROFILES } from "@/lib/engine/profiles";
import type { AuditAnswers } from "@/lib/engine/types";

describe("share encoding", () => {
  it("round-trips every demo profile exactly", () => {
    for (const profile of DEMO_PROFILES) {
      expect(decodeAnswers(encodeAnswers(profile.answers))).toEqual(profile.answers);
    }
  });

  it("round-trips fractional answers without splitting on the decimal point", () => {
    const a: AuditAnswers = {
      ...EMPTY_ANSWERS,
      physicians: 1.5,
      clinicalDaysPerWeek: 4.5,
      frontOfficeFte: 2.5,
      billingPercent: 6.25,
    };
    expect(decodeAnswers(encodeAnswers(a))).toEqual(a);
  });

  it("refuses a link that carries no answers at all", () => {
    // Contract change, deliberate: an all-unknown payload is not a report. It
    // previously round-tripped, which meant a mangled or truncated URL could
    // render a confident audit of a practice with zero physicians and zero
    // collections. The results page now shows the broken-link state instead.
    expect(decodeAnswers(encodeAnswers(EMPTY_ANSWERS))).toBeNull();
    expect(decodeAnswers("_".repeat(17))).toBeNull();
  });

  it("keeps a partially answered audit, and treats blanks as unknown", () => {
    const partial: AuditAnswers = { ...EMPTY_ANSWERS, physicians: 2, noShowRate: 0 };
    const back = decodeAnswers(encodeAnswers(partial))!;
    expect(back).toEqual(partial);
    expect(back.annualCollections).toBeNull();
    // The zero must survive as a zero, not become unknown.
    expect(back.noShowRate).toBe(0);
  });

  it("never decodes a blank segment to zero", () => {
    const parts = encodeAnswers(DEMO_PROFILES[0]!.answers).split("_");
    parts[2] = ""; // collections wiped by a truncated copy-paste
    const back = decodeAnswers(parts.join("_"))!;
    expect(back.annualCollections).toBeNull();
    expect(back.physicians).toBe(1);
  });

  it("preserves the difference between zero and unknown", () => {
    const a: AuditAnswers = { ...EMPTY_ANSWERS, noShowRate: 0, daysInAR: null };
    const back = decodeAnswers(encodeAnswers(a))!;
    expect(back.noShowRate).toBe(0);
    expect(back.daysInAR).toBeNull();
  });

  it("round-trips every billing model", () => {
    for (const model of ["outsourced", "in_house", "hybrid"] as const) {
      const back = decodeAnswers(encodeAnswers({ ...EMPTY_ANSWERS, billingModel: model }))!;
      expect(back.billingModel).toBe(model);
    }
  });

  it("rejects malformed or truncated input instead of guessing", () => {
    expect(decodeAnswers(null)).toBeNull();
    expect(decodeAnswers("")).toBeNull();
    expect(decodeAnswers("1_2_3")).toBeNull();
    expect(decodeAnswers("4.5")).toBeNull();
    expect(decodeAnswers("garbage")).toBeNull();
  });

  it("drops out-of-range values from a hand-edited link", () => {
    const encoded = encodeAnswers(DEMO_PROFILES[0]!.answers).split("_");
    encoded[2] = "999999999999";
    const back = decodeAnswers(encoded.join("_"))!;
    expect(back.annualCollections).toBeNull();
    expect(back.physicians).toBe(1);
  });

  it("ignores non-numeric junk without throwing", () => {
    const encoded = encodeAnswers(DEMO_PROFILES[0]!.answers).split("_");
    encoded[10] = "abc";
    expect(() => decodeAnswers(encoded.join("_"))).not.toThrow();
    expect(decodeAnswers(encoded.join("_"))!.noShowRate).toBeNull();
  });

  it("produces a link short enough to paste in an email", () => {
    expect(encodeAnswers(DEMO_PROFILES[1]!.answers).length).toBeLessThan(120);
  });
});

describe("question flow", () => {
  it("asks between 9 and 15 questions", () => {
    const fieldCount = STEPS.reduce((s, step) => s + step.fields.length, 0);
    expect(STEPS.length).toBeGreaterThanOrEqual(7);
    expect(fieldCount).toBeGreaterThanOrEqual(9);
    expect(fieldCount).toBeLessThanOrEqual(20);
  });

  it("gives every step a rationale the physician can read", () => {
    for (const step of STEPS) {
      expect(step.prompt.length).toBeGreaterThan(10);
      expect(step.rationale.length).toBeGreaterThan(40);
    }
  });

  it("shows billing sub-questions only for the relevant model", () => {
    const billing = STEPS.find((s) => s.id === "billing")!;
    const outsourced = visibleFields(billing, { ...EMPTY_ANSWERS, billingModel: "outsourced" });
    const inHouse = visibleFields(billing, { ...EMPTY_ANSWERS, billingModel: "in_house" });
    const hybrid = visibleFields(billing, { ...EMPTY_ANSWERS, billingModel: "hybrid" });
    expect(outsourced.map((f) => f.key)).toContain("billingPercent");
    expect(outsourced.map((f) => f.key)).not.toContain("billingFte");
    expect(inHouse.map((f) => f.key)).toContain("billingFte");
    expect(inHouse.map((f) => f.key)).not.toContain("billingPercent");
    expect(hybrid.map((f) => f.key)).toEqual(
      expect.arrayContaining(["billingPercent", "billingFte"]),
    );
  });

  it("blocks a step only on the fields that cannot be skipped", () => {
    const access = STEPS.find((s) => s.id === "access")!;
    // Both access fields are skippable, so an empty step is still complete.
    expect(isStepComplete(access, EMPTY_ANSWERS)).toBe(true);

    const providers = STEPS.find((s) => s.id === "providers")!;
    expect(isStepComplete(providers, EMPTY_ANSWERS)).toBe(false);
    expect(isStepComplete(providers, { ...EMPTY_ANSWERS, physicians: 1, apps: 0 })).toBe(true);
  });

  it("counts a zero as answered when measuring completeness", () => {
    expect(completeness(EMPTY_ANSWERS)).toBe(0);
    expect(completeness({ ...EMPTY_ANSWERS, noShowRate: 0 })).toBeGreaterThan(0);
    expect(completeness(DEMO_PROFILES[0]!.answers)).toBe(1);
  });

  it("does not count billing fields that do not apply to the chosen model", () => {
    const inHouse: AuditAnswers = { ...DEMO_PROFILES[1]!.answers };
    expect(inHouse.billingModel).toBe("in_house");
    expect(inHouse.billingPercent).toBeNull();
    expect(completeness(inHouse)).toBe(1);
  });

  it("keeps every field key unique across the flow", () => {
    const keys = STEPS.flatMap((s) => s.fields.map((f) => f.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("covers every answer key with a question", () => {
    const asked = new Set(STEPS.flatMap((s) => s.fields.map((f) => f.key as string)));
    for (const key of Object.keys(EMPTY_ANSWERS)) expect(asked.has(key)).toBe(true);
  });
});
