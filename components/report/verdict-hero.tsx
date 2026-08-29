import { currencyExact, metricValue } from "@/lib/format";
import type { AuditResult } from "@/lib/engine/types";

const VERDICT_TONE: Record<string, string> = {
  healthy: "border-signal-strong",
  watch: "border-signal-mid",
  act: "border-accent",
  insufficient_data: "border-rule-strong",
};

const VERDICT_LABEL: Record<string, string> = {
  healthy: "Verdict · Operationally healthy",
  watch: "Verdict · Worth watching",
  act: "Verdict · Something specific to act on",
  insufficient_data: "Verdict · Withheld",
};

/**
 * The first viewport. A physician should be able to read this and know the
 * answer, then decide whether to keep going. Everything below it is support.
 */
export function VerdictHero({ result }: { result: AuditResult }) {
  const { verdict, score } = result;
  const hourly = result.metrics.find(
    (m) => m.key === "contributionPerProviderHour",
  );

  return (
    <section className="print-avoid-break">
      <p className="eyebrow">{VERDICT_LABEL[verdict.level]}</p>
      <div className={`mt-4 border-l-2 pl-5 sm:pl-7 ${VERDICT_TONE[verdict.level]}`}>
        <h1 className="display text-[1.6rem] leading-[1.25] text-ink sm:text-[2.1rem]">
          {verdict.headline}
        </h1>
        <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-ink-muted">
          {verdict.detail}
        </p>
        <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-1.5">
          {verdict.basis.map((b) => (
            <li
              key={b}
              className="text-[12px] leading-snug text-ink-faint before:mr-2 before:text-rule-strong before:content-['—']"
            >
              {b}
            </li>
          ))}
        </ul>
      </div>

      {/* The two figures worth carrying out of the report. */}
      <dl className="mt-8 grid gap-px overflow-hidden rounded-lg border border-rule bg-rule sm:grid-cols-2">
        <div className="bg-paper-raised px-6 py-5">
          <dt className="eyebrow">Practice Leverage Score</dt>
          <dd className="mt-2 flex items-baseline gap-2">
            <span
              className={`tnum display leading-none ${
                score.overall === null
                  ? "text-[1.5rem] text-ink-faint"
                  : "text-[2.6rem] text-ink"
              }`}
            >
              {score.overall ?? "Withheld"}
            </span>
            {score.overall !== null ? (
              <span className="tnum text-[13px] text-ink-faint">/ 100</span>
            ) : null}
          </dd>
          <p className="mt-2 text-[13px] leading-snug text-ink-muted">
            {score.band}
          </p>
        </div>
        <div className="bg-paper-raised px-6 py-5">
          <dt className="eyebrow">Value of one provider hour</dt>
          <dd className="mt-2">
            <span className="tnum display text-[2.6rem] leading-none text-ink">
              {hourly ? metricValue(hourly.value, hourly.unit) : "—"}
            </span>
          </dd>
          <p className="mt-2 text-[13px] leading-snug text-ink-muted">
            Contribution, from your own collections and clinic hours — not gross
            revenue.
          </p>
        </div>
      </dl>

      {result.opportunityHigh > 0 && verdict.level !== "healthy" ? (
        <p className="mt-4 text-[13.5px] leading-relaxed text-ink-muted">
          Across {result.quantifiedCount} quantified finding
          {result.quantifiedCount === 1 ? "" : "s"}, the identified recurring
          range is{" "}
          <span className="tnum font-semibold text-ink">
            {currencyExact(result.opportunityLow)}–
            {currencyExact(result.opportunityHigh)}
          </span>{" "}
          a year
          {result.oneTimeHigh > 0 ? (
            <>
              , plus{" "}
              <span className="tnum font-semibold text-ink">
                {currencyExact(result.oneTimeLow)}–
                {currencyExact(result.oneTimeHigh)}
              </span>{" "}
              of one-time working capital
            </>
          ) : null}
          .
        </p>
      ) : null}
    </section>
  );
}
