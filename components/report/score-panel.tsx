"use client";

import { useState } from "react";
import { ConfidenceChip } from "@/components/primitives";
import type { PracticeScore } from "@/lib/engine/types";

/**
 * The score is only credible if the user can see the curve behind it, so the
 * anchors are one click away on every dimension rather than buried in a
 * methodology page nobody opens.
 */
export function ScorePanel({ score }: { score: PracticeScore }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="print-block rounded-lg border border-rule bg-paper-raised">
      <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)] lg:gap-12">
        <div>
          <p className="eyebrow">Practice Leverage Score</p>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="tnum display text-[4.5rem] leading-none text-ink">
              {score.overall ?? "—"}
            </span>
            <span className="tnum text-[15px] text-ink-faint">/ 100</span>
          </div>
          <p className="mt-3 text-[15px] font-semibold text-ink">
            {score.band}
          </p>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">
            {score.bandDescription}
          </p>
          <p className="mt-4 border-t border-rule pt-3 text-[12px] leading-relaxed text-ink-faint">
            A low score means leverage is available, not that the practice is
            badly run. Scored on {score.scoredCount} of {score.totalCount}{" "}
            dimensions
            {score.coverage < 0.99
              ? " — the rest were skipped, and unscored dimensions are excluded rather than counted as zero."
              : "."}
          </p>
        </div>

        <div>
          <ul className="space-y-4">
            {score.dimensions.map((d) => {
              const expanded = open === d.key;
              return (
                <li key={d.key}>
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : d.key)}
                    aria-expanded={expanded}
                    className="w-full text-left"
                  >
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-[14px] font-semibold text-ink">
                        {d.label}
                      </span>
                      <span className="tnum shrink-0 text-[13px] text-ink-muted">
                        {d.score === null ? (
                          <span className="text-ink-faint">
                            not scored
                          </span>
                        ) : (
                          <>
                            <span className="font-semibold text-ink">
                              {Math.round(d.score)}
                            </span>
                            <span className="text-ink-faint">
                              {" "}
                              · weight {d.weight}
                            </span>
                          </>
                        )}
                      </span>
                    </div>
                    <div className="mt-2 h-[6px] w-full overflow-hidden rounded-full bg-paper-sunk">
                      {d.score !== null ? (
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${Math.max(2, d.score)}%` }}
                        />
                      ) : (
                        <div className="h-full w-full bg-[repeating-linear-gradient(135deg,var(--color-rule)_0_4px,transparent_4px_8px)]" />
                      )}
                    </div>
                  </button>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-ink-muted">
                    {d.rationale}
                  </p>
                  {expanded ? (
                    <div className="mt-3 rounded border border-rule bg-paper-sunk p-3">
                      <p className="eyebrow">Scoring curve</p>
                      <p className="tnum mt-1.5 text-[12px] leading-relaxed text-ink-muted">
                        {d.anchors}
                      </p>
                      <p className="mt-2 text-[11.5px] leading-relaxed text-ink-faint">
                        Values between anchors are interpolated linearly. These
                        curves are our judgement, published so you can disagree
                        with them — they are not derived from a benchmark data
                        set.
                      </p>
                      <div className="mt-2">
                        <ConfidenceChip level={d.confidence} />
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <p className="no-print mt-5 text-[12px] text-ink-faint">
            Select any dimension to see the exact curve used to score it.
          </p>
        </div>
      </div>
    </div>
  );
}
