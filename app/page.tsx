import Link from "next/link";
import { Wordmark } from "@/components/wordmark";
import { DEMO_PROFILES } from "@/lib/engine/profiles";
import { STEPS } from "@/lib/engine/questions";
import { runAudit } from "@/lib/engine/audit";

import { landingCopy } from "@/lib/experiment";
import { LandingTelemetry } from "@/components/variant-sync";
import { VARIANT_COOKIE } from "@/middleware";
import { cookies } from "next/headers";
import type { Variant } from "@/lib/analytics";

/**
 * What a real user actually answers: every field, less one of the two mutually
 * exclusive billing sub-questions (a practice sees either the vendor fee or the
 * in-house FTE count, never both).
 */
const QUESTION_COUNT = STEPS.reduce((s, step) => s + step.fields.length, 0) - 1;

/**
 * The hero excerpt is generated from a real demo profile rather than written by
 * hand, so the marketing can never quietly drift away from what the engine
 * actually produces.
 */
const SAMPLE = runAudit(DEMO_PROFILES[2]!.answers);
const SAMPLE_FINDING = SAMPLE.topOpportunities[0]!;

const WHAT_YOU_GET = [
  {
    title: "A Practice Leverage Score",
    body: "One number across six dimensions — access, front office, physician time, revenue operations, overhead, and technology — with the scoring curve for each one printed next to it, so you can disagree with the model rather than trust it.",
  },
  {
    title: "Three to four ranked opportunities",
    body: "Each one quotes your own figures back to you, shows the arithmetic, gives a dollar range rather than a point estimate, and states how confident it is and why.",
  },
  {
    title: "The value of an hour of your time",
    body: "Calculated from your collections, clinic days, and hours — at marginal contribution, not gross revenue. It becomes the exchange rate for every decision in the report.",
  },
  {
    title: "A 30-day measurement plan",
    body: "Nothing on it requires buying anything. It is the list of things worth counting before you spend money against any finding here, including ours.",
  },
];

const HONESTY = [
  {
    label: "No industry benchmarks",
    body: "We ship no benchmark database, because we will not invent one. Every comparison here is either your own arithmetic or a named assumption you can change.",
  },
  {
    label: "Estimates, clearly labelled",
    body: "Ranges, not point values. Each carries its formula and its assumptions. Nothing in this report is an audited financial result and it never pretends to be.",
  },
  {
    label: "Your results are not held hostage",
    body: "No email, no account, no gate. You see everything the moment you finish, and the link works whether or not you ever speak to us.",
  },
  {
    label: "No language model involved",
    body: "This is arithmetic, not generated text. The same answers always produce the same report, the formulas are printed next to the findings, and the calculation engine has a test suite. Nothing here was written by a chatbot reading your inputs.",
  },
];

export default async function LandingPage() {
  const jar = await cookies();
  const assigned = jar.get(VARIANT_COOKIE)?.value;
  const variant: Variant = assigned === "B" ? "B" : "A";
  const copy = landingCopy(variant, QUESTION_COUNT, STEPS.length);

  return (
    <>
      <LandingTelemetry variant={variant} />
      <div className="mx-auto max-w-[1140px] px-5 sm:px-8">
        <header className="flex items-center justify-between py-6">
          <Wordmark />
          {/* The hero CTA sits immediately below on a phone; repeating it in
              the header only costs a line of wrapped text. */}
          <Link
            href="/audit"
            className="hidden whitespace-nowrap text-[13px] font-semibold tracking-wide text-accent no-underline hover:text-accent-ink sm:inline"
          >
            {copy.ctaLabel} →
          </Link>
        </header>

        {/* ── Hero ────────────────────────────────────────────────────── */}
        <section className="border-t border-rule pt-12 sm:pt-16">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-16">
            <div>
              <p className="eyebrow">{copy.eyebrow}</p>
              <h1 className="display mt-5 text-[2.6rem] leading-[1.05] tracking-tight text-ink sm:text-[3.4rem]">
                {copy.headline[0]}
                <br />
                {copy.headline[1]}
              </h1>
              <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-ink-muted">
                {copy.subhead}
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
                <Link
                  href="/audit"
                  className="inline-flex min-h-12 items-center justify-center rounded-md bg-accent px-7 py-3.5 text-[15px] font-semibold text-white no-underline transition-colors hover:bg-accent-ink"
                >
                  {copy.ctaLabel}
                </Link>
                <div className="text-[13px] leading-snug text-ink-faint">
                  About five minutes.
                  <br />
                  No account, no email, no gate on your results.
                </div>
              </div>

              <dl className="mt-12 grid grid-cols-2 gap-x-8 gap-y-6 border-t border-rule pt-8 sm:grid-cols-4">
                {copy.stats.map(([value, label]) => (
                  <div key={label}>
                    <dt className="tnum display text-2xl text-ink">
                      {value}
                    </dt>
                    <dd className="mt-1 text-[12px] uppercase tracking-[0.1em] text-ink-faint">
                      {label}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Sample of the actual output, not a stock illustration. */}
            <div className="lg:pt-6">
              <div className="rounded-lg border border-rule bg-paper-raised p-6 sm:p-7">
                <p className="eyebrow">{copy.sampleEyebrow}</p>
                <p className="display mt-3 text-[19px] leading-snug text-ink">
                  {SAMPLE_FINDING.title}
                </p>
                <p className="mt-3 text-[14px] leading-relaxed text-ink-muted">
                  {SAMPLE_FINDING.headline}
                </p>
                <dl className="mt-5 space-y-2 border-t border-rule pt-4 text-[13px]">
                  {SAMPLE_FINDING.evidence.slice(0, 4).map((line) => (
                    <div
                      key={line.label}
                      className="flex items-baseline justify-between gap-4"
                    >
                      <dt className="text-ink-muted">{line.label}</dt>
                      <dd className="tnum shrink-0 font-semibold text-ink">
                        {line.value}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-4 border-t border-rule pt-4 text-[13px] leading-relaxed text-ink-muted">
                  <span className="font-semibold text-ink">Next step · </span>
                  {SAMPLE_FINDING.nextStep}
                </p>
              </div>
              <p className="mt-3 text-[12px] leading-relaxed text-ink-faint">
                Drawn from a synthetic demo practice. Your report is generated
                from your own numbers.
              </p>
            </div>
          </div>
        </section>

        {/* ── Who it's for ────────────────────────────────────────────── */}
        <section className="mt-24 border-t border-rule pt-12">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
            <div>
              <p className="eyebrow">Who this is for</p>
              <h2 className="display mt-3 text-[1.75rem] leading-tight text-ink">
                Built for independent dermatology first
              </h2>
            </div>
            <div className="space-y-5 text-[15px] leading-relaxed text-ink-muted">
              <p>
                The questions, the scoring curves, and the findings are tuned
                for owner-operated dermatology — high visit volume, real
                procedural revenue, prior authorization pressure, and a front
                desk carrying more than it should. Mohs, plastics, allergy, and
                med spa practices will find most of it applies.
              </p>
              <p>
                It is not built for hospital-employed physicians, multi-site
                platforms with a corporate finance function, or anyone looking
                for a valuation. If your first question is about EBITDA
                multiples, this is the wrong tool.
              </p>
              <p className="text-ink">
                It is most useful if you suspect something is leaking, can
                roughly estimate a dozen operating numbers, and want a specific
                second opinion rather than a general one.
              </p>
            </div>
          </div>
        </section>

        {/* ── What you get ────────────────────────────────────────────── */}
        <section className="mt-24 border-t border-rule pt-12">
          <p className="eyebrow">What you receive</p>
          <div className="mt-8 grid gap-x-12 gap-y-10 sm:grid-cols-2">
            {WHAT_YOU_GET.map((item, i) => (
              <div key={item.title} className="flex gap-5">
                <span className="tnum shrink-0 pt-1 text-[13px] font-semibold text-ink-faint">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="text-[16px] font-semibold text-ink">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
                    {item.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── How it works ────────────────────────────────────────────── */}
        <section className="mt-24 border-t border-rule pt-12">
          <p className="eyebrow">How it works</p>
          <ol className="mt-8 grid gap-8 sm:grid-cols-3">
            {[
              {
                n: "01",
                t: "Answer what you know",
                b: `${STEPS.length} screens, one topic each. Estimates are fine, and "I don't know" is a real answer — it lowers the confidence on the findings that depended on it instead of blocking the audit.`,
              },
              {
                n: "02",
                t: "See the arithmetic",
                b: "Every figure shows its formula and the assumptions behind it. Change an assumption and the whole report recalculates in front of you.",
              },
              {
                n: "03",
                t: "Leave with a plan",
                b: "Three or four ranked findings, the workflows worth automating, the questions the data cannot answer, and four weeks of measurement that costs nothing.",
              },
            ].map((s) => (
              <li key={s.n}>
                <p className="tnum text-[13px] font-semibold text-accent">
                  {s.n}
                </p>
                <h3 className="mt-2 text-[16px] font-semibold text-ink">
                  {s.t}
                </h3>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
                  {s.b}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Honesty ─────────────────────────────────────────────────── */}
        <section className="mt-24 border-t border-rule pt-12">
          <p className="eyebrow">What this is not</p>
          <h2 className="display mt-3 max-w-2xl text-[1.75rem] leading-tight text-ink">
            A diagnostic is only worth anything if you can check its work
          </h2>
          <div className="mt-8 grid gap-x-12 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {HONESTY.map((h) => (
              <div key={h.label} className="border-t border-rule-strong pt-4">
                <h3 className="text-[14px] font-semibold text-ink">
                  {h.label}
                </h3>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
                  {h.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Demo practices ──────────────────────────────────────────── */}
        <section className="mt-24 border-t border-rule pt-12">
          <p className="eyebrow">See it first</p>
          <h2 className="display mt-3 text-[1.75rem] leading-tight text-ink">
            Or read a finished report before you answer anything
          </h2>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-muted">
            Three synthetic practices, each reaching a different conclusion —
            including one where the audit decides there is nothing worth buying.
            Entirely fabricated; no real practice data appears anywhere in this
            product.{" "}
            <Link
              href="/demo"
              className="font-semibold text-accent no-underline hover:text-accent-ink"
            >
              Open the finished reports
            </Link>
            .
          </p>
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {DEMO_PROFILES.map((p) => (
              <Link
                key={p.id}
                href={`/audit?demo=${p.id}`}
                className="group flex flex-col rounded-lg border border-rule bg-paper-raised p-5 no-underline transition-colors hover:border-rule-strong"
              >
                <p className="text-[12px] uppercase tracking-[0.1em] text-ink-faint">
                  {p.tagline}
                </p>
                <h3 className="mt-2.5 text-[16px] font-semibold leading-snug text-ink">
                  {p.name}
                </h3>
                <p className="mt-2.5 flex-1 text-[13.5px] leading-relaxed text-ink-muted">
                  {p.description}
                </p>
                <span className="mt-4 text-[13px] font-semibold text-accent group-hover:text-accent-ink">
                  Load this practice →
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* ── Close ───────────────────────────────────────────────────── */}
        <section className="mt-24 border-t border-rule py-16">
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-16">
            <div>
              <h2 className="display text-[1.9rem] leading-tight text-ink">
                {copy.closingHeadline}
              </h2>
              <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-muted">
                {QUESTION_COUNT} questions across {STEPS.length} screens, about
                five minutes. Every number shows its work, and you keep the
                report whether or not you ever talk to us.
              </p>
            </div>
            <Link
              href="/audit"
              className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-md bg-accent px-8 py-3.5 text-[15px] font-semibold text-white no-underline transition-colors hover:bg-accent-ink"
            >
              {copy.ctaLabel}
            </Link>
          </div>
        </section>

        <footer className="border-t border-rule py-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Wordmark subdued />
            <p className="max-w-xl text-[12px] leading-relaxed text-ink-faint">
              QNTM is an operating and automation partner for independent
              physician practices. This tool produces directional estimates from
              self-reported figures. It is not financial, legal, tax, or
              clinical advice, and it is not an audited financial statement.
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}
