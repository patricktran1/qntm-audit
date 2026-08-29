"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/wordmark";
import { ConfidenceChip, SectionHeading } from "@/components/primitives";
import { AssumptionsPanel } from "./assumptions-panel";
import { FindingCard } from "./finding-card";
import { ScorePanel } from "./score-panel";
import { track } from "@/lib/analytics";
import { currencyExact, metricValue, num } from "@/lib/format";
import { textSummary } from "@/lib/summary";
import { encodeAnswers } from "@/lib/share";
import { runAudit } from "@/lib/engine/audit";
import { DEFAULT_ASSUMPTIONS } from "@/lib/engine/assumptions";
import { BUCKET_DESCRIPTION, BUCKET_LABEL } from "@/lib/engine/prioritize";
import type {
  Assumptions,
  AuditAnswers,
  Bucket,
  Finding,
} from "@/lib/engine/types";

const BUCKET_ORDER: Bucket[] = [
  "quick_win",
  "strategic_bet",
  "monitor",
  "low_priority",
];

export function ReportView({ answers }: { answers: AuditAnswers }) {
  const [assumptions, setAssumptions] = useState<Assumptions>(DEFAULT_ASSUMPTIONS);
  const result = useMemo(() => runAudit(answers, assumptions), [answers, assumptions]);
  const reported = useRef(false);

  useEffect(() => {
    if (reported.current) return;
    reported.current = true;
    track({ name: "results_viewed", score: result.score.overall });
  }, [result.score.overall]);

  const dirty = useMemo(
    () =>
      (Object.keys(DEFAULT_ASSUMPTIONS) as (keyof Assumptions)[]).some(
        (k) => assumptions[k] !== DEFAULT_ASSUMPTIONS[k],
      ),
    [assumptions],
  );

  const setAssumption = useCallback((key: keyof Assumptions, value: number) => {
    setAssumptions((prev) => ({ ...prev, [key]: value }));
    track({ name: "assumption_changed", key, value });
  }, []);

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/results?a=${encodeURIComponent(
      encodeAnswers(answers),
    )}`;
  }, [answers]);

  const grouped = useMemo(() => {
    const map = new Map<Bucket, Finding[]>();
    for (const bucket of BUCKET_ORDER) map.set(bucket, []);
    for (const f of result.findings) map.get(f.bucket)!.push(f);
    return BUCKET_ORDER.map((b) => ({ bucket: b, findings: map.get(b)! })).filter(
      (g) => g.findings.length > 0,
    );
  }, [result.findings]);

  const timeLeaks = useMemo(
    () =>
      [
        {
          label: "Physician administrative time",
          hours: result.metrics.find((m) => m.key === "physicianAdminOpportunityCost")
            ? (answers.physicianAdminHoursPerWeek ?? 0) *
              assumptions.clinicalWeeksPerYear *
              (answers.physicians ?? 0)
            : null,
          value: result.metrics.find(
            (m) => m.key === "physicianAdminOpportunityCost",
          )?.value,
          note: "Charting, inbox, refills, and forms, priced at the contribution value of a clinical hour.",
        },
        {
          label: "Front-office time on phones",
          hours:
            answers.callsPerDay !== null && answers.clinicalDaysPerWeek !== null
              ? (result.metrics.find((m) => m.key === "callHoursPerDay")?.value ?? 0) *
                answers.clinicalDaysPerWeek *
                assumptions.clinicalWeeksPerYear
              : null,
          value: null,
          note: "Handled calls only. Time spent on calls that were never answered does not appear here.",
        },
        {
          label: "Clinical staff time on prior authorization",
          hours:
            answers.priorAuthStaffHoursPerWeek !== null
              ? answers.priorAuthStaffHoursPerWeek * assumptions.clinicalWeeksPerYear
              : null,
          value: result.metrics.find((m) => m.key === "priorAuthLaborCost")?.value,
          note: "Payer paperwork, at loaded clinical staff cost.",
        },
      ].filter((t) => t.hours !== null && t.hours > 0),
    [answers, assumptions, result.metrics],
  );

  return (
    <div className="min-h-screen">
      <ReportHeader
        result={result}
        shareUrl={shareUrl}
        encodedAnswers={encodeAnswers(answers)}
      />

      <main className="mx-auto max-w-[1000px] px-5 pb-24 sm:px-8">
        {/* ── Executive summary ─────────────────────────────────────── */}
        <section className="pt-10 sm:pt-14">
          <p className="eyebrow">Executive summary</p>
          <div className="mt-5 space-y-4 border-l-2 border-accent pl-5 sm:pl-7">
            {result.executiveSummary.map((line, i) => (
              <p
                key={line.slice(0, 40)}
                className={
                  i === 0
                    ? "display text-[1.35rem] leading-snug text-ink sm:text-[1.5rem]"
                    : "max-w-3xl text-[15px] leading-relaxed text-ink-muted"
                }
              >
                {line}
              </p>
            ))}
          </div>

          {result.completeness < 1 ? (
            <p className="mt-6 rounded-md border border-rule bg-paper-sunk px-4 py-3 text-[13px] leading-relaxed text-ink-muted">
              You answered {Math.round(result.completeness * 100)}% of the
              questions. Skipped inputs did not block the audit — they lowered
              the confidence on findings that needed them, and became questions
              at the end of this report.
            </p>
          ) : null}
        </section>

        {/* ── Score ─────────────────────────────────────────────────── */}
        <section className="mt-14">
          <SectionHeading eyebrow="Score" title="Where the capacity is going">
            Six dimensions, weighted. Each one is scored against a published
            curve rather than against other practices — we do not hold a
            benchmark data set, and we would rather say so than invent one.
          </SectionHeading>
          <ScorePanel score={result.score} />
        </section>

        {/* ── Top opportunities ─────────────────────────────────────── */}
        {result.topOpportunities.length > 0 ? (
          <section className="mt-16 print-break-before">
            <SectionHeading
              eyebrow={`Top ${result.topOpportunities.length} opportunities`}
              title="What is worth looking at first"
            >
              Ordered by how loud the signal is, not by how easy the fix is.
              Sequencing comes next.
            </SectionHeading>

            {result.opportunityHigh > 0 ? (
              <div className="print-block mb-8 rounded-lg border border-rule bg-paper-sunk p-6">
                <div className="flex flex-wrap items-baseline gap-x-8 gap-y-4">
                  <div>
                    <p className="eyebrow">Identified recurring range</p>
                    <p className="tnum display mt-1.5 text-[1.75rem] text-ink">
                      {currencyExact(result.opportunityLow)}
                      <span className="text-ink-faint"> – </span>
                      {currencyExact(result.opportunityHigh)}
                      <span className="text-[15px] text-ink-faint">
                        {" "}
                        / year
                      </span>
                    </p>
                  </div>
                  {result.oneTimeHigh > 0 ? (
                    <div>
                      <p className="eyebrow">One-time cash release</p>
                      <p className="tnum display mt-1.5 text-[1.75rem] text-ink-muted">
                        {currencyExact(result.oneTimeLow)}
                        <span className="text-ink-faint"> – </span>
                        {currencyExact(result.oneTimeHigh)}
                      </p>
                    </div>
                  ) : null}
                </div>
                <p className="mt-4 max-w-3xl border-t border-rule pt-4 text-[13px] leading-relaxed text-ink-muted">
                  Across {result.quantifiedCount} quantified finding
                  {result.quantifiedCount === 1 ? "" : "s"}. These ranges
                  overlap — several of them draw on the same underlying hours
                  and slots — so treat the total as an order of magnitude rather
                  than a sum. One-time cash is working capital released by
                  faster collection, not new revenue, which is why it is
                  reported separately.
                </p>
              </div>
            ) : null}

            <div className="space-y-8">
              {result.topOpportunities.map((f, i) => (
                <FindingCard key={f.id} finding={f} index={i} />
              ))}
            </div>
          </section>
        ) : (
          <section className="mt-16">
            <SectionHeading eyebrow="Opportunities" title="Nothing stood out">
              On the dimensions we measured, none of the detectors fired. That is
              a real result rather than a failure of the tool — the questions
              further down are where the remaining uncertainty sits.
            </SectionHeading>
          </section>
        )}

        {/* ── Prioritization matrix ─────────────────────────────────── */}
        {result.findings.length > 0 ? (
          <section className="mt-16 print-break-before">
            <SectionHeading
              eyebrow="Prioritization"
              title="What to do first, and what to leave alone"
            >
              Every finding placed by impact, effort, and how much we trust the
              data behind it. A high-impact finding we are not confident in
              becomes something to measure, never something to buy.
            </SectionHeading>

            <div className="space-y-6">
              {grouped.map(({ bucket, findings }) => (
                <div
                  key={bucket}
                  className="print-block print-avoid-break rounded-lg border border-rule bg-paper-raised p-6"
                >
                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <h3 className="text-[15px] font-semibold text-ink">
                      {BUCKET_LABEL[bucket]}
                    </h3>
                    <span className="tnum text-[12px] text-ink-faint">
                      {findings.length}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
                    {BUCKET_DESCRIPTION[bucket]}
                  </p>
                  <ul className="mt-4 space-y-3 border-t border-rule pt-4">
                    {findings.map((f) => (
                      <li
                        key={f.id}
                        className="flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
                      >
                        <div className="min-w-0">
                          <p className="text-[14px] font-medium leading-snug text-ink">
                            {f.title}
                          </p>
                          <p className="mt-0.5 text-[12px] uppercase tracking-[0.08em] text-ink-faint">
                            {f.category} · impact {f.impact} · effort {f.effort}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          {f.estimate ? (
                            <span className="tnum text-[13px] font-semibold text-ink">
                              {currencyExact(f.estimate.low)}–
                              {currencyExact(f.estimate.high)}
                            </span>
                          ) : (
                            <span className="text-[12px] text-ink-faint">
                              not quantified
                            </span>
                          )}
                          <ConfidenceChip level={f.confidence} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* ── Economic snapshot ─────────────────────────────────────── */}
        {result.metrics.length > 0 ? (
          <section className="mt-16 print-break-before">
            <SectionHeading
              eyebrow="Economic snapshot"
              title="Your practice, in the numbers it implies"
            >
              Everything below is calculated from what you entered. Nothing is
              compared against an outside data set.
            </SectionHeading>
            <div className="print-block rounded-lg border border-rule bg-paper-raised">
              <dl className="divide-y divide-rule">
                {result.metrics.map((m) => (
                  <div
                    key={m.key}
                    className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-6 py-3.5 sm:px-8"
                  >
                    <dt className="min-w-0 flex-1 text-[14px] text-ink">
                      {m.label}
                      {m.note ? (
                        <span className="mt-0.5 block max-w-2xl text-[12px] leading-relaxed text-ink-faint">
                          {m.note}
                        </span>
                      ) : null}
                    </dt>
                    <dd className="tnum shrink-0 text-[16px] font-semibold text-ink">
                      {metricValue(m.value, m.unit)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>
        ) : null}

        {/* ── Time leaks ────────────────────────────────────────────── */}
        {timeLeaks.length > 0 ? (
          <section className="mt-16">
            <SectionHeading eyebrow="Time leaks" title="Where the hours are going">
              Annualised from what you reported. Hours are the currency that
              matters most here — dollars are downstream of them.
            </SectionHeading>
            <div className="grid gap-4 sm:grid-cols-3">
              {timeLeaks.map((t) => (
                <div
                  key={t.label}
                  className="print-block rounded-lg border border-rule bg-paper-raised p-5"
                >
                  <p className="tnum display text-[1.6rem] leading-none text-ink">
                    {num(t.hours!)}
                    <span className="text-[13px] text-ink-faint"> hrs/yr</span>
                  </p>
                  <p className="mt-2.5 text-[14px] font-semibold leading-snug text-ink">
                    {t.label}
                  </p>
                  {t.value ? (
                    <p className="tnum mt-1 text-[13px] text-ink-muted">
                      {currencyExact(t.value)} of value at stake
                    </p>
                  ) : null}
                  <p className="mt-2.5 text-[12px] leading-relaxed text-ink-faint">
                    {t.note}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* ── Automation candidates ─────────────────────────────────── */}
        {result.automationCandidates.length > 0 ? (
          <section className="mt-16">
            <SectionHeading
              eyebrow="Automation candidates"
              title="The workflows your answers actually point at"
            >
              Not a catalogue. These are the only workflows your inputs justify
              investigating, with an honest note on what current technology does
              and does not handle.
            </SectionHeading>
            <div className="space-y-4">
              {result.automationCandidates.map((c) => (
                <div
                  key={c.workflow}
                  className="print-block print-avoid-break rounded-lg border border-rule bg-paper-raised p-6"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                    <h3 className="text-[16px] font-semibold text-ink">
                      {c.label}
                    </h3>
                    <ConfidenceChip level={c.confidence} />
                  </div>
                  <p className="mt-2.5 text-[14px] leading-relaxed text-ink">
                    <span className="font-semibold">Why this one · </span>
                    {c.trigger}
                  </p>
                  {c.hoursPerYear ? (
                    <p className="tnum mt-2 text-[13px] text-ink-muted">
                      Roughly {num(c.hoursPerYear)} hours a year sit in this
                      workflow
                      {c.annualLaborCost
                        ? `, worth about ${currencyExact(c.annualLaborCost)} at the labour rates in the assumptions below`
                        : ""}
                      .
                    </p>
                  ) : null}
                  <p className="mt-3 border-t border-rule pt-3 text-[13.5px] leading-relaxed text-ink-muted">
                    <span className="font-semibold text-ink">
                      What is realistic today ·{" "}
                    </span>
                    {c.readiness}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* ── Open questions ────────────────────────────────────────── */}
        <section className="mt-16 print-break-before">
          <SectionHeading
            eyebrow="Open questions"
            title="What this audit cannot tell you"
          >
            Thirteen questions cannot describe a practice. These are the gaps
            that most affect the reliability of everything above.
          </SectionHeading>
          <ol className="print-block divide-y divide-rule rounded-lg border border-rule bg-paper-raised">
            {result.openQuestions.map((q) => (
              <li key={q.question} className="px-6 py-4 sm:px-8">
                <p className="text-[14.5px] font-medium leading-snug text-ink">
                  {q.question}
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
                  {q.why}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* ── 30-day plan ───────────────────────────────────────────── */}
        <section className="mt-16">
          <SectionHeading eyebrow="Next 30 days" title="Measure before you spend">
            Nothing on this list requires buying anything — including from us.
            It is the evidence you would want before acting on any finding above.
          </SectionHeading>
          <ol className="space-y-3">
            {result.plan.map((item, i) => (
              <li
                key={`${item.week}-${i}`}
                className="print-block print-avoid-break grid gap-x-6 gap-y-2 rounded-lg border border-rule bg-paper-raised p-5 sm:grid-cols-[110px_minmax(0,1fr)]"
              >
                <div>
                  <p className="text-[13px] font-semibold text-accent">
                    {item.week}
                  </p>
                  <p className="mt-0.5 text-[12px] text-ink-faint">
                    {item.owner}
                  </p>
                </div>
                <div>
                  <p className="text-[14.5px] leading-relaxed text-ink">
                    {item.action}
                  </p>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
                    {item.unlocks}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Assumptions ───────────────────────────────────────────── */}
        <section className="mt-16 print-break-before">
          <SectionHeading
            eyebrow="Assumptions"
            title="Every number in this report, and where it came from"
          >
            If you disagree with a figure above, change the assumption behind it
            and watch the report move. That is the point of this section.
          </SectionHeading>
          <AssumptionsPanel
            assumptions={assumptions}
            metrics={result.metrics}
            onChange={setAssumption}
            onReset={() => setAssumptions(DEFAULT_ASSUMPTIONS)}
            dirty={dirty}
          />
        </section>

        {/* ── CTA ───────────────────────────────────────────────────── */}
        <section className="no-print mt-16">
          <div className="rounded-lg border border-rule-strong bg-paper-raised p-7 sm:p-9">
            <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-12">
              <div>
                <p className="eyebrow">Want a second set of eyes?</p>
                <h2 className="display mt-3 text-[1.5rem] leading-snug text-ink">
                  We can go through this with you and build the implementation
                  plan
                </h2>
                <p className="mt-3 max-w-2xl text-[14.5px] leading-relaxed text-ink-muted">
                  QNTM is an operating and automation partner for independent
                  physician practices. If the findings above match what you see
                  day to day, a 30-minute review is usually enough to work out
                  whether the first fix is worth doing at all — and we will tell
                  you when it is not.
                </p>
              </div>
              <Link
                href={`/talk?a=${encodeURIComponent(encodeAnswers(answers))}`}
                onClick={() => track({ name: "cta_clicked", location: "results_footer" })}
                className="inline-flex shrink-0 items-center justify-center rounded-md bg-accent px-7 py-3.5 text-[15px] font-semibold text-white no-underline transition-colors hover:bg-accent-ink"
              >
                Request a review
              </Link>
            </div>
          </div>
        </section>

        <footer className="mt-16 border-t border-rule pt-8">
          <p className="max-w-3xl text-[12px] leading-relaxed text-ink-faint">
            This report is a directional operational diagnostic built from
            self-reported figures and the assumptions shown above. It is not an
            audited financial statement, and it is not financial, legal, tax, or
            clinical advice. No industry benchmark data was used. Figures marked
            as estimates are estimates, and the ranges overlap by design.
          </p>
          <div className="no-print mt-6 flex flex-wrap items-center gap-6">
            <Wordmark subdued />
            <Link
              href="/audit"
              className="text-[13px] font-medium text-ink-muted no-underline hover:text-ink"
            >
              Run another audit
            </Link>
            <Link
              href={`/brief?a=${encodeURIComponent(encodeAnswers(answers))}`}
              className="text-[13px] font-medium text-ink-faint no-underline hover:text-ink"
            >
              Internal opportunity brief
            </Link>
          </div>
        </footer>
      </main>
    </div>
  );
}

function ReportHeader({
  result,
  shareUrl,
  encodedAnswers,
}: {
  result: ReturnType<typeof runAudit>;
  shareUrl: string;
  encodedAnswers: string;
}) {
  const [copied, setCopied] = useState<"summary" | "link" | null>(null);

  const copy = useCallback(
    async (kind: "summary" | "link") => {
      const text = kind === "link" ? shareUrl : textSummary(result, shareUrl);
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // Clipboard blocked (insecure context, permissions). Fall back to a
        // selection prompt rather than failing silently.
        window.prompt("Copy this:", text);
      }
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 2200);
      track(
        kind === "link"
          ? { name: "report_shared" }
          : { name: "report_downloaded", format: "clipboard" },
      );
    },
    [result, shareUrl],
  );

  return (
    <header className="sticky top-0 z-10 border-b border-rule bg-paper/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1000px] items-center justify-between gap-x-4 px-5 py-3 sm:px-8 sm:py-3.5">
        <Wordmark subdued />
        <div className="no-print flex items-center gap-2">
          <button
            type="button"
            onClick={() => copy("summary")}
            className="rounded-md border border-rule-strong px-3 py-2 text-[13px] font-medium text-ink-muted transition-colors hover:border-ink-faint hover:text-ink sm:px-3.5"
          >
            {copied === "summary" ? "Copied" : "Copy"}
            <span className="hidden sm:inline">&nbsp;summary</span>
          </button>
          <button
            type="button"
            onClick={() => copy("link")}
            className="rounded-md border border-rule-strong px-3 py-2 text-[13px] font-medium text-ink-muted transition-colors hover:border-ink-faint hover:text-ink sm:px-3.5"
          >
            {copied === "link" ? "Copied" : "Share"}
            <span className="hidden sm:inline">&nbsp;link</span>
          </button>
          <button
            type="button"
            onClick={() => {
              track({ name: "report_downloaded", format: "pdf" });
              window.print();
            }}
            className="rounded-md bg-ink px-3 py-2 text-[13px] font-semibold text-paper transition-colors hover:bg-accent-ink sm:px-3.5"
          >
            <span className="hidden sm:inline">Download&nbsp;</span>PDF
          </button>
        </div>
      </div>
      <div className="print-only mx-auto max-w-[1000px] px-5 pb-3 text-[10px] text-ink-faint">
        QNTM Practice Audit · report id {encodedAnswers.slice(0, 24)}…
      </div>
    </header>
  );
}
