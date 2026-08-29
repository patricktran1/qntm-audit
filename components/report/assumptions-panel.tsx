"use client";

import { useState } from "react";
import { EDITABLE_ASSUMPTIONS, DEFAULT_ASSUMPTIONS } from "@/lib/engine/assumptions";
import { track } from "@/lib/analytics";
import { currencyExact, num, rawPercent } from "@/lib/format";
import { HAS_BENCHMARKS, THRESHOLDS } from "@/lib/engine/thresholds";
import type { Assumptions, Metric, PracticeScore } from "@/lib/engine/types";

function display(value: number, unit: "currency" | "percent" | "number"): string {
  if (unit === "currency") return currencyExact(value);
  if (unit === "percent") return rawPercent(value * 100, value < 0.1 ? 1 : 0);
  return num(value, value % 1 === 0 ? 0 : 1);
}

export function AssumptionsPanel({
  assumptions,
  metrics,
  score,
  onChange,
  onReset,
  dirty,
}: {
  assumptions: Assumptions;
  metrics: Metric[];
  score: PracticeScore;
  onChange: (key: keyof Assumptions, value: number) => void;
  onReset: () => void;
  dirty: boolean;
}) {
  const [methodOpen, setMethodOpen] = useState(false);
  const [thresholdsOpen, setThresholdsOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="print-block rounded-lg border border-rule bg-paper-raised p-6 sm:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <p className="eyebrow">Editable assumptions</p>
          <div className="flex items-center gap-4">
            {dirty ? (
              <span className="tnum text-[12.5px] text-ink-muted">
                Score now{" "}
                <span className="font-semibold text-ink">
                  {score.overall ?? "withheld"}
                </span>
              </span>
            ) : null}
            {dirty ? (
              <button
                type="button"
                onClick={onReset}
                className="no-print min-h-11 text-[12.5px] font-medium text-accent underline decoration-rule-strong underline-offset-4"
              >
                Reset to defaults
              </button>
            ) : null}
          </div>
        </div>
        <p className="mt-3 max-w-3xl text-[14px] leading-relaxed text-ink-muted">
          These are planning defaults, not published benchmarks. They were chosen
          to make the audit understate opportunity rather than overstate it.
          Change any of them and every figure above recalculates immediately — if
          you think a number in this report is wrong, this is where to prove it.
        </p>

        <div className="mt-7 grid gap-x-10 gap-y-6 sm:grid-cols-2">
          {EDITABLE_ASSUMPTIONS.map((meta) => {
            const value = assumptions[meta.key];
            const changed = value !== DEFAULT_ASSUMPTIONS[meta.key];
            return (
              <div key={meta.key}>
                <div className="flex items-baseline justify-between gap-3">
                  <label
                    htmlFor={`assumption-${meta.key}`}
                    className="text-[13.5px] font-semibold leading-snug text-ink"
                  >
                    {meta.label}
                    {meta.sensitivity === "high" ? (
                      <span
                        className="ml-1.5 align-middle text-[10px] uppercase tracking-wider text-accent"
                        title="Moves a large share of this report"
                      >
                        key
                      </span>
                    ) : null}
                  </label>
                  <span
                    className={`tnum shrink-0 text-[13px] font-semibold ${
                      changed ? "text-accent" : "text-ink"
                    }`}
                  >
                    {display(value, meta.unit)}
                  </span>
                </div>
                <input
                  id={`assumption-${meta.key}`}
                  type="range"
                  min={meta.min}
                  max={meta.max}
                  step={meta.step}
                  value={value}
                  onChange={(e) => onChange(meta.key, Number(e.target.value))}
                  className="no-print mt-2.5 w-full accent-accent"
                />
                <p className="mt-1.5 text-[12px] leading-relaxed text-ink-faint">
                  {meta.help}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="print-block rounded-lg border border-rule bg-paper-raised p-6 sm:p-8">
        <button
          type="button"
          onClick={() => {
            if (!methodOpen) track({ name: "methodology_expanded", section: "formulas" });
            setMethodOpen((v) => !v);
          }}
          aria-expanded={methodOpen}
          aria-controls="methodology-formulas"
          className="no-print flex min-h-11 w-full items-center justify-between gap-4 text-left"
        >
          <span className="eyebrow">How every figure was calculated</span>
          <span aria-hidden className="text-[15px] text-ink-faint">
            {methodOpen ? "\u2212" : "+"}
          </span>
        </button>
        <p className="print-only eyebrow">How every figure was calculated</p>
        <div
          id="methodology-formulas"
          hidden={!methodOpen}
          className="print-force-open mt-5 overflow-x-auto"
        >
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-rule-strong">
                <th className="pb-2 pr-4 text-[11px] uppercase tracking-[0.1em] text-ink-faint">
                  Metric
                </th>
                <th className="pb-2 pr-4 text-[11px] uppercase tracking-[0.1em] text-ink-faint">
                  Formula
                </th>
                <th className="pb-2 text-right text-[11px] uppercase tracking-[0.1em] text-ink-faint">
                  Confidence
                </th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.key} className="border-b border-rule align-top">
                  <td className="py-2.5 pr-4 text-[13px] font-medium text-ink">
                    {m.label}
                    {m.note ? (
                      <p className="mt-1 max-w-xs text-[11.5px] font-normal leading-relaxed text-ink-faint">
                        {m.note}
                      </p>
                    ) : null}
                  </td>
                  <td className="tnum py-2.5 pr-4 text-[12.5px] leading-relaxed text-ink-muted">
                    {m.formula}
                  </td>
                  <td className="py-2.5 text-right text-[12px] capitalize text-ink-muted">
                    {m.confidence}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="print-block rounded-lg border border-rule bg-paper-raised p-6 sm:p-8">
        <button
          type="button"
          onClick={() => {
            if (!thresholdsOpen)
              track({ name: "methodology_expanded", section: "thresholds" });
            setThresholdsOpen((v) => !v);
          }}
          aria-expanded={thresholdsOpen}
          aria-controls="methodology-thresholds"
          className="no-print flex min-h-11 w-full items-center justify-between gap-4 text-left"
        >
          <span className="eyebrow">
            Every threshold we applied, and where it came from
          </span>
          <span aria-hidden className="text-[15px] text-ink-faint">
            {thresholdsOpen ? "\u2212" : "+"}
          </span>
        </button>
        <p className="print-only eyebrow">
          Every threshold we applied, and where it came from
        </p>

        <div
          id="methodology-thresholds"
          hidden={!thresholdsOpen}
          className="print-force-open mt-5"
        >
          <p className="max-w-3xl text-[13px] leading-relaxed text-ink-muted">
            {HAS_BENCHMARKS
              ? "Thresholds marked as benchmark-derived come from a cited distribution; the rest are arithmetic or our judgement."
              : "This audit ships with no industry benchmark data, so nothing below is benchmark-derived. Every threshold is either arithmetic — it follows from a definition — or our own judgement, which you are entitled to disagree with."}
          </p>
          <ul className="mt-4 space-y-4">
            {THRESHOLDS.map((t) => (
              <li key={t.id} className="border-t border-rule pt-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="text-[13.5px] font-semibold text-ink">
                    {t.label}
                    <span className="tnum ml-2 font-normal text-ink-muted">
                      {t.value}
                    </span>
                  </p>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ${
                      t.provenance === "arithmetic"
                        ? "border-signal-strong/40 text-signal-strong"
                        : t.provenance === "benchmark"
                          ? "border-accent/40 text-accent"
                          : "border-signal-mid/40 text-signal-mid"
                    }`}
                  >
                    {t.provenance === "product_judgment"
                      ? "our judgement"
                      : t.provenance.replace("_", " ")}
                  </span>
                </div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
                  {t.rationale}
                </p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-ink-faint">
                  Applied in: {t.usedIn}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
