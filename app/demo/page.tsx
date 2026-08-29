import Link from "next/link";
import { Wordmark } from "@/components/wordmark";
import { DEMO_PROFILES } from "@/lib/engine/profiles";
import { runAudit } from "@/lib/engine/audit";
import { encodeAnswers } from "@/lib/share";
import { currencyExact } from "@/lib/format";
import { DemoControls } from "@/components/demo-controls";

export const metadata = {
  title: "Sample reports — QNTM Practice Audit",
  robots: { index: false, follow: true },
};

/**
 * A deliberate demo surface, not a debug page. Built so a finished report can
 * be opened in two taps from a phone in front of someone, with each practice
 * summarised by the conclusion the audit reaches rather than by its inputs.
 */
export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const params = await searchParams;
  // Default attribution for in-person demonstrations, overridable per event.
  const source = /^[a-z0-9._-]{1,48}$/i.test(params.source ?? "")
    ? params.source!.toLowerCase()
    : "leaderm";

  const cards = DEMO_PROFILES.map((p) => {
    const result = runAudit(p.answers);
    return {
      profile: p,
      href: `/results?a=${encodeURIComponent(encodeAnswers(p.answers))}&demo=1`,
      score: result.score.overall,
      verdict: result.verdict.level,
      lead: result.topOpportunities[0]?.title ?? "No dominant finding",
      range:
        result.opportunityHigh > 0
          ? `${currencyExact(result.opportunityLow)}–${currencyExact(result.opportunityHigh)}`
          : null,
    };
  });

  return (
    <div className="mx-auto max-w-[900px] px-5 py-10 sm:px-8 sm:py-16">
      <Wordmark />

      <h1 className="display mt-10 text-[2.2rem] leading-tight text-ink sm:text-[2.6rem]">
        Three practices, three conclusions
      </h1>
      <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-ink-muted">
        Finished reports from synthetic practices. Each one reaches a different
        verdict, including one where the audit concludes there is nothing worth
        buying. No real practice or patient data appears anywhere in this
        product.
      </p>

      <div className="mt-10 space-y-4">
        {cards.map((c) => (
          <Link
            key={c.profile.id}
            href={c.href}
            className="group block rounded-lg border border-rule bg-paper-raised p-6 no-underline transition-colors hover:border-rule-strong"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
              <p className="text-[12px] uppercase tracking-[0.1em] text-ink-faint">
                {c.profile.tagline}
              </p>
              <p className="tnum text-[12px] uppercase tracking-[0.1em] text-ink-faint">
                Score {c.score ?? "withheld"} ·{" "}
                {c.verdict.replace("_", " ")}
              </p>
            </div>
            <h2 className="display mt-2.5 text-[1.3rem] leading-snug text-ink">
              {c.profile.name}
            </h2>
            <p className="mt-2.5 max-w-2xl text-[14px] leading-relaxed text-ink-muted">
              {c.profile.description}
            </p>
            <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-1 border-t border-rule pt-4">
              <span className="text-[13px] text-ink">
                <span className="font-semibold">Leads with · </span>
                {c.lead}
              </span>
              {c.range ? (
                <span className="tnum text-[13px] text-ink-muted">{c.range}/yr</span>
              ) : null}
            </div>
            <span className="mt-4 inline-block text-[13px] font-semibold text-accent group-hover:text-accent-ink">
              Open this report →
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-12 rounded-lg border border-rule bg-paper-raised p-6 sm:p-7">
        <p className="eyebrow">Run it on your own practice</p>
        <h2 className="display mt-2.5 text-[1.35rem] leading-snug text-ink">
          About five minutes, on your own numbers
        </h2>
        <p className="mt-2.5 max-w-2xl text-[14px] leading-relaxed text-ink-muted">
          Seventeen questions. You keep the report whether or not we ever speak
          again, and there is no email gate on the results.
        </p>
        <Link
          href={`/audit?source=${encodeURIComponent(source)}`}
          className="mt-5 inline-flex min-h-12 items-center justify-center rounded-md bg-accent px-7 text-[15px] font-semibold text-white no-underline transition-colors hover:bg-accent-ink"
        >
          Start my audit
        </Link>
      </div>

      <DemoControls source={source} />
    </div>
  );
}
