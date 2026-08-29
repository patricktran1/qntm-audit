"use client";

import { useState } from "react";
import {
  ConfidenceChip,
  LevelChip,
  ProvenanceKey,
  ProvenanceMark,
} from "@/components/primitives";
import { track } from "@/lib/analytics";
import { currencyExact } from "@/lib/format";
import { BUCKET_LABEL } from "@/lib/engine/prioritize";
import type { Finding } from "@/lib/engine/types";

const KIND_LABEL: Record<string, string> = {
  recoverable: "Estimated recoverable value",
  freed_capacity: "Estimated value of freed capacity",
  current_cost: "What this currently costs",
};

/**
 * Progressive disclosure: the headline, the number, and the next step are
 * always visible; the evidence trail and the arithmetic are one click away.
 * A physician skimming gets the finding; one who wants to check the work gets
 * everything, on the same page.
 *
 * Printing forces every card open — a PDF with collapsed sections is useless.
 */
export function FindingCard({
  finding,
  index,
  defaultOpen = false,
}: {
  finding: Finding;
  index: number;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const e = finding.estimate;

  const toggle = () => {
    if (!open)
      track({
        name: "finding_expanded",
        findingId: finding.id,
        category: finding.category,
      });
    setOpen((v) => !v);
  };

  return (
    <article className="print-block print-avoid-break rounded-lg border border-rule bg-paper-raised">
      <div className="px-6 py-5 sm:px-8">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="tnum text-[13px] font-semibold text-accent">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="eyebrow">{finding.category}</span>
          <span className="text-[11px] uppercase tracking-[0.1em] text-ink-faint">
            {BUCKET_LABEL[finding.bucket]}
          </span>
        </div>
        <h3 className="display mt-2.5 text-[1.3rem] leading-snug text-ink sm:text-[1.45rem]">
          {finding.title}
        </h3>
        <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-ink">
          {finding.headline}
        </p>

        {e ? (
          <div className="mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="tnum display text-[1.4rem] text-ink">
              {currencyExact(e.low)}
              <span className="text-ink-faint"> &ndash; </span>
              {currencyExact(e.high)}
            </span>
            <span className="text-[12px] uppercase tracking-[0.08em] text-ink-faint">
              {KIND_LABEL[e.kind]}
              {e.recurrence === "one_time" ? " · one-time" : " · per year"}
            </span>
          </div>
        ) : (
          <p className="mt-5 text-[13px] leading-relaxed text-ink-muted">
            Not quantified — doing so honestly would need assumptions your
            answers cannot support.
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2">
          <LevelChip label="Impact" level={finding.impact} />
          <LevelChip label="Effort" level={finding.effort} />
          <ConfidenceChip level={finding.confidence} />
        </div>
      </div>

      <div className="no-print border-t border-rule px-6 sm:px-8">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={`finding-detail-${finding.id}`}
          className="flex min-h-11 w-full items-center justify-between gap-4 py-3 text-left text-[13px] font-semibold text-ink-muted transition-colors hover:text-ink"
        >
          <span>
            {open ? "Hide" : "Show"} the evidence and the arithmetic
          </span>
          <span aria-hidden className="text-ink-faint">
            {open ? "−" : "+"}
          </span>
        </button>
      </div>

      <div
        id={`finding-detail-${finding.id}`}
        hidden={!open}
        className="print-force-open grid gap-x-10 gap-y-7 border-t border-rule px-6 py-6 sm:px-8 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]"
      >
        <div>
          <p className="eyebrow">The numbers behind it</p>
          <dl className="mt-3 space-y-1.5">
            {finding.evidence.map((line) => (
              <div
                key={line.label}
                className="flex items-baseline justify-between gap-3 border-b border-dotted border-rule pb-1.5"
              >
                <dt className="text-[13px] leading-snug text-ink-muted">
                  {line.label}
                  <ProvenanceMark kind={line.reported ? "observed" : "estimated"} />
                </dt>
                <dd className="tnum shrink-0 text-[13px] font-semibold text-ink">
                  {line.value}
                </dd>
              </div>
            ))}
          </dl>
          <ProvenanceKey className="mt-2.5" />
        </div>

        <div>
          <p className="eyebrow">What it probably means</p>
          <p className="mt-3 text-[14.5px] leading-relaxed text-ink-muted">
            {finding.interpretation}
          </p>

          {e ? (
            <div className="mt-6 rounded-md border border-rule bg-paper-sunk p-4">
              <p className="eyebrow">How that range was calculated</p>
              <p className="tnum mt-2.5 text-[12.5px] leading-relaxed text-ink-muted">
                {e.formula}
              </p>
              <ul className="mt-2.5 space-y-1 border-t border-rule pt-2.5">
                {e.assumptions.map((a) => (
                  <li
                    key={a}
                    className="text-[12px] leading-relaxed text-ink-faint"
                  >
                    <span className="text-ink-muted">Assumes</span> {a}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      <div className="border-t border-rule bg-paper-sunk/60 px-6 py-4 sm:px-8">
        <p className="text-[14px] leading-relaxed text-ink">
          <span className="font-semibold">Next step &middot; </span>
          {finding.nextStep}
        </p>
      </div>
    </article>
  );
}
