"use client";

import { EDITABLE_ASSUMPTIONS, DEFAULT_ASSUMPTIONS } from "@/lib/engine/assumptions";
import { currencyExact, num, rawPercent } from "@/lib/format";
import type { Assumptions, Metric } from "@/lib/engine/types";

function display(value: number, unit: "currency" | "percent" | "number"): string {
  if (unit === "currency") return currencyExact(value);
  if (unit === "percent") return rawPercent(value * 100, value < 0.1 ? 1 : 0);
  return num(value, value % 1 === 0 ? 0 : 1);
}

export function AssumptionsPanel({
  assumptions,
  metrics,
  onChange,
  onReset,
  dirty,
}: {
  assumptions: Assumptions;
  metrics: Metric[];
  onChange: (key: keyof Assumptions, value: number) => void;
  onReset: () => void;
  dirty: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="print-block rounded-lg border border-rule bg-paper-raised p-6 sm:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <p className="eyebrow">Editable assumptions</p>
          {dirty ? (
            <button
              type="button"
              onClick={onReset}
              className="no-print text-[12.5px] font-medium text-accent underline decoration-rule-strong underline-offset-4"
            >
              Reset to defaults
            </button>
          ) : null}
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
        <p className="eyebrow">How every figure was calculated</p>
        <div className="mt-5 overflow-x-auto">
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
        <p className="mt-5 border-t border-rule pt-4 text-[12.5px] leading-relaxed text-ink-faint">
          This audit ships with no industry benchmark data. We would rather show
          you your own arithmetic than quote an average we cannot source. Where a
          comparison was unavoidable — days in A/R, for instance — the threshold
          is stated as a working target and labelled as our judgement.
        </p>
      </div>
    </div>
  );
}
