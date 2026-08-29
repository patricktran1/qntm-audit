import Link from "next/link";
import { Wordmark } from "@/components/wordmark";
import { buildBrief } from "@/lib/engine/brief";
import { runAudit } from "@/lib/engine/audit";
import { decodeAnswers } from "@/lib/share";
import { currencyExact } from "@/lib/format";
import { BriefTelemetry } from "./brief-telemetry";
import type { FitLevel } from "@/lib/engine/brief";

export const metadata = {
  title: "Internal opportunity brief — QNTM",
  robots: { index: false, follow: false, nocache: true },
};

const FIT_STYLE: Record<FitLevel, string> = {
  strong: "text-signal-strong border-signal-strong/40",
  possible: "text-signal-mid border-signal-mid/40",
  weak: "text-ink-faint border-rule-strong",
};

export default async function BriefPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string }>;
}) {
  const { a } = await searchParams;
  const answers = decodeAnswers(a);

  if (!answers) {
    return (
      <div className="mx-auto flex min-h-screen max-w-[620px] flex-col justify-center px-5 sm:px-8">
        <Wordmark />
        <h1 className="display mt-8 text-[1.75rem] text-ink">
          No report attached to this link
        </h1>
        <p className="mt-3 text-[15px] text-ink-muted">
          A brief is generated from a completed audit. Open a report first, then
          use the internal brief link at the bottom of it.
        </p>
        <Link
          href="/audit"
          className="mt-6 w-fit text-[14px] font-semibold text-accent no-underline"
        >
          Run an audit →
        </Link>
      </div>
    );
  }

  const result = runAudit(answers);
  const brief = buildBrief(result);

  return (
    <div className="mx-auto max-w-[880px] px-5 py-10 sm:px-8 sm:py-14">
      <BriefTelemetry />

      <header className="flex flex-wrap items-center justify-between gap-4">
        <Wordmark subdued />
        <span className="rounded border border-signal-weak/40 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-signal-weak">
          Internal — not shown to the practice
        </span>
      </header>

      <h1 className="display mt-10 text-[2.1rem] leading-tight text-ink">
        Opportunity brief
      </h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-muted">
        Generated from the same inputs as the practice&rsquo;s report, with
        nothing added. If this brief overstates the opportunity, the first call
        exposes it — so it does not.
      </p>

      <dl className="mt-10 grid gap-x-10 gap-y-6 border-y border-rule py-7 sm:grid-cols-3">
        {[
          ["Size", brief.sizeBand],
          ["Collections", brief.estimatedAnnualCollections],
          ["Data quality", brief.dataQuality],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="eyebrow">{k}</dt>
            <dd className="mt-1.5 text-[14px] leading-relaxed text-ink">{v}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-10">
        <p className="eyebrow">Practice profile</p>
        <p className="mt-2 text-[15px] leading-relaxed text-ink">
          {brief.practiceProfile}
        </p>
      </section>

      <section className="mt-10 rounded-lg border border-rule bg-paper-raised p-6">
        <p className="eyebrow">Highest pain</p>
        <h2 className="display mt-2 text-[1.35rem] leading-snug text-ink">
          {brief.highestPain}
        </h2>
        <ul className="mt-4 space-y-1.5 border-t border-rule pt-4">
          {brief.painEvidence.map((line) => (
            <li key={line} className="tnum text-[13.5px] text-ink-muted">
              {line}
            </li>
          ))}
        </ul>
        <div className="mt-5 border-t border-rule pt-4">
          <p className="eyebrow">Estimated opportunity</p>
          <p className="tnum display mt-1.5 text-[1.5rem] text-ink">
            {brief.opportunityRange}
          </p>
          {result.oneTimeHigh > 0 ? (
            <p className="tnum mt-1 text-[13px] text-ink-muted">
              Plus {currencyExact(result.oneTimeLow)}–
              {currencyExact(result.oneTimeHigh)} one-time working capital.
            </p>
          ) : null}
          <p className="mt-2 text-[12.5px] leading-relaxed text-signal-weak">
            {brief.opportunityCaveat}
          </p>
        </div>
      </section>

      <section className="mt-10">
        <p className="eyebrow">Probable QNTM fit</p>
        <ul className="mt-4 space-y-3">
          {brief.serviceFit.map((s) => (
            <li
              key={s.service}
              className="rounded-lg border border-rule bg-paper-raised p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-[14.5px] font-semibold text-ink">
                  {s.service}
                </p>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${FIT_STYLE[s.fit]}`}
                >
                  {s.fit}
                </span>
              </div>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">
                {s.rationale}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10 rounded-lg border-l-2 border-accent bg-accent-soft/40 py-5 pl-6 pr-5">
        <p className="eyebrow">Recommended conversation</p>
        <p className="mt-2 text-[15px] leading-relaxed text-ink">
          {brief.recommendedConversation}
        </p>
      </section>

      <section className="mt-10">
        <p className="eyebrow">Discovery questions</p>
        <ol className="mt-4 space-y-2.5">
          {brief.discoveryQuestions.map((q, i) => (
            <li key={q} className="flex gap-4">
              <span className="tnum shrink-0 text-[13px] font-semibold text-ink-faint">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-[14.5px] leading-relaxed text-ink">
                {q}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-10 rounded-lg border border-signal-weak/30 bg-signal-weak/5 p-6">
        <p className="eyebrow">Reasons not to pursue</p>
        <ul className="mt-3 space-y-2">
          {brief.disqualifiers.map((d) => (
            <li key={d} className="text-[14px] leading-relaxed text-ink">
              {d}
            </li>
          ))}
        </ul>
        <p className="mt-4 border-t border-signal-weak/20 pt-3 text-[12.5px] leading-relaxed text-ink-muted">
          This section exists because the audit is only a useful sales tool for
          as long as it is an honest diagnostic. A manufactured problem costs
          more credibility than any single engagement is worth.
        </p>
      </section>

      <footer className="mt-12 border-t border-rule pt-6">
        <Link
          href={`/results?a=${encodeURIComponent(a ?? "")}`}
          className="text-[14px] font-medium text-ink-muted no-underline hover:text-ink"
        >
          ← The report the practice sees
        </Link>
      </footer>
    </div>
  );
}
