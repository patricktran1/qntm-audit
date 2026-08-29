import { ConfidenceChip, LevelChip } from "@/components/primitives";
import { currencyExact } from "@/lib/format";
import { BUCKET_LABEL } from "@/lib/engine/prioritize";
import type { Finding } from "@/lib/engine/types";

const KIND_LABEL: Record<string, string> = {
  recoverable: "Estimated recoverable value",
  freed_capacity: "Estimated value of freed capacity",
  current_cost: "What this currently costs",
};

export function FindingCard({ finding, index }: { finding: Finding; index: number }) {
  const e = finding.estimate;
  return (
    <article className="print-block print-avoid-break rounded-lg border border-rule bg-paper-raised">
      <div className="border-b border-rule px-6 py-5 sm:px-8">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="tnum text-[13px] font-semibold text-accent">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="eyebrow">{finding.category}</span>
        </div>
        <h3 className="display mt-2.5 text-[1.3rem] leading-snug text-ink sm:text-[1.45rem]">
          {finding.title}
        </h3>
        <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-ink">
          {finding.headline}
        </p>
      </div>

      <div className="grid gap-x-10 gap-y-7 px-6 py-6 sm:px-8 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
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
                  {!line.reported ? (
                    <span
                      className="ml-1 text-ink-faint"
                      title="Calculated by this audit from your other answers"
                    >
                      &fnof;
                    </span>
                  ) : null}
                </dt>
                <dd className="tnum shrink-0 text-[13px] font-semibold text-ink">
                  {line.value}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-2.5 text-[11.5px] leading-relaxed text-ink-faint">
            &fnof; marks a value this audit calculated. Everything else is what
            you entered.
          </p>
        </div>

        <div>
          <p className="eyebrow">What it probably means</p>
          <p className="mt-3 text-[14.5px] leading-relaxed text-ink-muted">
            {finding.interpretation}
          </p>

          {e ? (
            <div className="mt-6 rounded-md border border-rule bg-paper-sunk p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="eyebrow">
                  {KIND_LABEL[e.kind] ?? "Estimate"}
                  {e.recurrence === "one_time" ? " · one-time" : " · per year"}
                </p>
                <p className="tnum display text-[1.35rem] text-ink">
                  {currencyExact(e.low)}
                  <span className="text-ink-faint"> &ndash; </span>
                  {currencyExact(e.high)}
                </p>
              </div>
              <p className="tnum mt-3 border-t border-rule pt-3 text-[12.5px] leading-relaxed text-ink-muted">
                <span className="font-semibold text-ink">Formula &middot; </span>
                {e.formula}
              </p>
              <ul className="mt-2.5 space-y-1">
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
          ) : (
            <p className="mt-6 rounded-md border border-dashed border-rule-strong bg-paper-sunk p-4 text-[13px] leading-relaxed text-ink-muted">
              We have not put a dollar figure on this one. Doing so honestly
              would require assumptions we cannot support from your answers, and
              a fabricated number here would undermine the ones above it.
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-rule bg-paper-sunk/60 px-6 py-4 sm:px-8">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <LevelChip label="Impact" level={finding.impact} />
          <LevelChip label="Effort" level={finding.effort} />
          <ConfidenceChip level={finding.confidence} />
          <span className="text-[11px] uppercase tracking-[0.1em] text-ink-faint">
            {BUCKET_LABEL[finding.bucket]}
          </span>
        </div>
        <p className="mt-3 text-[14px] leading-relaxed text-ink">
          <span className="font-semibold">Next step &middot; </span>
          {finding.nextStep}
        </p>
      </div>
    </article>
  );
}
