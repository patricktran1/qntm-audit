import Link from "next/link";
import { Wordmark } from "@/components/wordmark";
import { buildBrief, type FitLevel } from "@/lib/engine/brief";
import { runAudit } from "@/lib/engine/audit";
import { decodeAnswers } from "@/lib/share";
import { BriefTelemetry } from "./brief-telemetry";

export const metadata = {
  title: "Internal opportunity brief — QNTM",
  robots: { index: false, follow: false, nocache: true },
};

const FIT_STYLE: Record<FitLevel, string> = {
  strong: "text-signal-strong border-signal-strong/40",
  possible: "text-signal-mid border-signal-mid/40",
  weak: "text-ink-faint border-rule-strong",
};

function Section({
  eyebrow,
  children,
  className = "",
}: {
  eyebrow: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`mt-10 ${className}`}>
      <p className="eyebrow">{eyebrow}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

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
          use its encoded answers here.
        </p>
      </div>
    );
  }

  const result = runAudit(answers);
  const brief = buildBrief(result);

  return (
    <div className="mx-auto max-w-[900px] px-5 py-10 sm:px-8 sm:py-14">
      <BriefTelemetry />

      <header className="flex flex-wrap items-center justify-between gap-4">
        <Wordmark subdued />
        <span className="rounded border border-signal-weak/40 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-signal-weak">
          Internal — not shown to the practice
        </span>
      </header>

      <h1 className="display mt-10 text-[2.1rem] leading-tight text-ink">
        Pre-call brief
      </h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-muted">
        Generated from the same inputs as the practice&rsquo;s report, by the
        same function. It cannot claim anything their report does not support.
      </p>

      {/* ── At a glance ────────────────────────────────────────────── */}
      <dl className="mt-9 grid gap-x-10 gap-y-6 border-y border-rule py-7 sm:grid-cols-3">
        {[
          ["Size", brief.sizeBand],
          ["Collections", brief.estimatedAnnualCollections],
          ["Coverage", brief.coverageSummary],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="eyebrow">{k}</dt>
            <dd className="mt-1.5 text-[14px] leading-relaxed text-ink">{v}</dd>
          </div>
        ))}
      </dl>

      <Section eyebrow="Verdict the practice was given">
        <p className="text-[15px] leading-relaxed text-ink">{brief.verdict}</p>
        <p className="mt-2 text-[13px] leading-relaxed text-signal-weak">
          {brief.confidenceCaution} {brief.dataQuality}
        </p>
      </Section>

      <Section eyebrow="Practice profile">
        <p className="text-[15px] leading-relaxed text-ink">
          {brief.practiceProfile}
        </p>
      </Section>

      {/* ── Pain ───────────────────────────────────────────────────── */}
      <section className="mt-10 rounded-lg border border-rule bg-paper-raised p-6">
        <p className="eyebrow">Primary pain</p>
        <h2 className="display mt-2 text-[1.35rem] leading-snug text-ink">
          {brief.primaryPain}
        </h2>
        {brief.primaryPainEvidence.length > 0 ? (
          <ul className="mt-4 space-y-1.5 border-t border-rule pt-4">
            {brief.primaryPainEvidence.map((e) => (
              <li
                key={e.label}
                className="tnum flex flex-wrap items-baseline justify-between gap-x-4 text-[13.5px] text-ink-muted"
              >
                <span>
                  {e.label}
                  <span
                    className={`ml-1.5 text-[10px] uppercase tracking-wide ${
                      e.observed ? "text-accent" : "text-ink-faint"
                    }`}
                  >
                    {e.observed ? "observed" : "inferred"}
                  </span>
                </span>
                <span className="font-semibold text-ink">{e.value}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {brief.secondaryPain ? (
          <div className="mt-6 border-t border-rule pt-4">
            <p className="eyebrow">Second-order pain</p>
            <p className="mt-1.5 text-[15px] leading-snug text-ink">
              {brief.secondaryPain}
            </p>
            <ul className="mt-3 space-y-1">
              {brief.secondaryPainEvidence.slice(0, 3).map((e) => (
                <li
                  key={e.label}
                  className="tnum flex flex-wrap items-baseline justify-between gap-x-4 text-[13px] text-ink-muted"
                >
                  <span>
                    {e.label}
                    <span
                      className={`ml-1.5 text-[10px] uppercase tracking-wide ${
                        e.observed ? "text-accent" : "text-ink-faint"
                      }`}
                    >
                      {e.observed ? "observed" : "inferred"}
                    </span>
                  </span>
                  <span className="font-semibold text-ink">{e.value}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {/* ── Economics ──────────────────────────────────────────────── */}
      <section className="mt-6 rounded-lg border border-signal-mid/40 bg-signal-mid/5 p-6">
        <p className="eyebrow">Potential economic range</p>
        <p className="tnum display mt-1.5 text-[1.5rem] text-ink">
          {brief.recurringRange}
        </p>
        {brief.oneTimeRange ? (
          <p className="tnum mt-1 text-[13px] text-ink-muted">
            Plus {brief.oneTimeRange}.
          </p>
        ) : null}
        <p className="mt-3 border-t border-signal-mid/20 pt-3 text-[13px] font-semibold leading-relaxed text-ink">
          Diagnostic opportunity estimates, not promised savings.
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
          {brief.opportunityCaveat}
        </p>

        {brief.sensitivity.length > 0 ? (
          <div className="mt-5 border-t border-signal-mid/20 pt-4">
            <p className="eyebrow">What the economics actually rest on</p>
            <ul className="mt-3 space-y-3">
              {brief.sensitivity.map((s) => (
                <li key={s.assumption}>
                  <p className="text-[13.5px] font-semibold text-ink">
                    {s.assumption}{" "}
                    <span className="tnum font-normal text-ink-muted">
                      · currently {s.currentValue}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">
                    {s.effect}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {/* ── Fit ────────────────────────────────────────────────────── */}
      <Section eyebrow="Probable QNTM fit">
        <ul className="space-y-3">
          {brief.serviceFit.map((s) => (
            <li
              key={s.service}
              className="rounded-lg border border-rule bg-paper-raised p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-[14.5px] font-semibold text-ink">{s.service}</p>
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
      </Section>

      <Section eyebrow="Do not pitch">
        <ul className="space-y-2 rounded-lg border border-signal-weak/30 bg-signal-weak/5 p-5">
          {brief.doNotPitch.map((d) => (
            <li key={d} className="text-[13.5px] leading-relaxed text-ink">
              {d}
            </li>
          ))}
        </ul>
      </Section>

      {/* ── Running the call ───────────────────────────────────────── */}
      <section className="mt-10 rounded-lg border-l-2 border-accent bg-accent-soft/40 py-5 pl-6 pr-5">
        <p className="eyebrow">Open with this</p>
        <p className="mt-2 text-[16px] leading-relaxed text-ink">
          {brief.openingQuestion}
        </p>
        <p className="mt-4 border-t border-accent/20 pt-3 text-[14px] leading-relaxed text-ink-muted">
          {brief.recommendedConversation}
        </p>
      </section>

      <Section eyebrow="Discovery questions">
        <ol className="space-y-2.5">
          {brief.discoveryQuestions.map((q, i) => (
            <li key={q} className="flex gap-4">
              <span className="tnum shrink-0 text-[13px] font-semibold text-ink-faint">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-[14.5px] leading-relaxed text-ink">{q}</span>
            </li>
          ))}
        </ol>
      </Section>

      {brief.likelyObjections.length > 0 ? (
        <Section eyebrow="Likely objections">
          <ul className="space-y-4">
            {brief.likelyObjections.map((o) => (
              <li key={o.objection} className="border-l-2 border-rule-strong pl-4">
                <p className="text-[14.5px] font-medium text-ink">{o.objection}</p>
                <p className="mt-1 text-[13.5px] leading-relaxed text-ink-muted">
                  {o.response}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section eyebrow="What would invalidate this audit">
        <ul className="space-y-2">
          {brief.invalidators.map((v) => (
            <li key={v} className="text-[13.5px] leading-relaxed text-ink-muted">
              {v}
            </li>
          ))}
        </ul>
      </Section>

      <Section eyebrow="Reasons not to pursue">
        <div className="rounded-lg border border-signal-weak/30 bg-signal-weak/5 p-5">
          <ul className="space-y-2">
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
        </div>
      </Section>

      <Section eyebrow="Suggested next action">
        <p className="text-[15px] leading-relaxed text-ink">
          {brief.suggestedNextAction}
        </p>
      </Section>

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
