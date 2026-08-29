"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/wordmark";
import {
  ConfidenceChip,
  EstimateCaveat,
  ProvenanceKey,
  ProvenanceMark,
  SectionHeading,
} from "@/components/primitives";
import { AssumptionsPanel } from "./assumptions-panel";
import { ConversionModule } from "./conversion-module";
import { FindingCard } from "./finding-card";
import { ScorePanel } from "./score-panel";
import { ShareActions } from "./share-actions";
import { VerdictHero } from "./verdict-hero";
import { reportDimensions, track } from "@/lib/analytics";
import { currencyExact, metricValue, num } from "@/lib/format";
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

/**
 * Report information hierarchy, in reading order:
 *   1 verdict + the two figures worth remembering
 *   2 what matters most (findings, progressively disclosed)
 *   3 economic consequence
 *   4 where the time goes / what could be automated
 *   5 what to do next (plan) and the conversation offer
 *   6 assumptions, editable
 *   7 methodology — score curves and formulas, present but not in the way
 */
export function ReportView({
  answers,
  demo = false,
}: {
  answers: AuditAnswers;
  demo?: boolean;
}) {
  const [assumptions, setAssumptions] = useState<Assumptions>(DEFAULT_ASSUMPTIONS);
  const result = useMemo(() => runAudit(answers, assumptions), [answers, assumptions]);
  const reported = useRef(false);
  const reportParam = useMemo(() => encodeAnswers(answers), [answers]);

  useEffect(() => {
    if (reported.current) return;
    reported.current = true;
    track({ name: "report_viewed", dimensions: reportDimensions(result), demo });
    // Dimensions are derived from the same answers on every render; reporting
    // once on mount is the intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dirty = useMemo(
    () =>
      (Object.keys(DEFAULT_ASSUMPTIONS) as (keyof Assumptions)[]).some(
        (k) => assumptions[k] !== DEFAULT_ASSUMPTIONS[k],
      ),
    [assumptions],
  );

  const setAssumption = useCallback(
    (key: keyof Assumptions, value: number) => {
      setAssumptions((prev) => {
        if (prev[key] !== value)
          track({
            name: "assumption_changed",
            key,
            value,
            direction: value > prev[key] ? "up" : "down",
          });
        return { ...prev, [key]: value };
      });
    },
    [],
  );

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/results?a=${encodeURIComponent(reportParam)}`;
  }, [reportParam]);

  const grouped = useMemo(() => {
    const map = new Map<Bucket, Finding[]>();
    for (const bucket of BUCKET_ORDER) map.set(bucket, []);
    for (const f of result.findings) map.get(f.bucket)!.push(f);
    return BUCKET_ORDER.map((b) => ({ bucket: b, findings: map.get(b)! })).filter(
      (g) => g.findings.length > 0,
    );
  }, [result.findings]);

  const timeLeaks = useMemo(() => {
    const callHours = result.metrics.find((m) => m.key === "callHoursPerDay")?.value;
    return [
      {
        label: "Physician administrative time",
        hours:
          answers.physicianAdminHoursPerWeek !== null && answers.physicians !== null
            ? answers.physicianAdminHoursPerWeek *
              assumptions.clinicalWeeksPerYear *
              answers.physicians
            : null,
        value: result.metrics.find((m) => m.key === "physicianAdminOpportunityCost")
          ?.value,
        note: "Charting, inbox, refills, and forms, priced at the contribution value of a clinical hour.",
      },
      {
        label: "Front-office time on phones",
        hours:
          callHours != null && answers.clinicalDaysPerWeek !== null
            ? callHours * answers.clinicalDaysPerWeek * assumptions.clinicalWeeksPerYear
            : null,
        value: null,
        note: "Handled calls only. Time lost to calls that were never answered does not appear here.",
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
    ].filter((t) => t.hours !== null && t.hours > 0);
  }, [answers, assumptions, result.metrics]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-rule bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1000px] items-center justify-between gap-x-4 px-5 py-3 sm:px-8 sm:py-3.5">
          <Wordmark subdued />
          <ShareActions result={result} shareUrl={shareUrl} />
        </div>
        {demo ? (
          <p className="no-print bg-accent-soft px-5 py-1.5 text-center text-[11.5px] tracking-wide text-accent-ink sm:px-8">
            Sample report · synthetic practice, not real patient or practice data
          </p>
        ) : null}
      </header>

      <main className="mx-auto max-w-[1000px] px-5 pb-24 sm:px-8">
        {/* ── 1 · Verdict ───────────────────────────────────────────── */}
        <div className="pt-10 sm:pt-14">
          <VerdictHero result={result} />
        </div>

        {result.completeness < 1 ? (
          <p className="mt-6 rounded-md border border-rule bg-paper-sunk px-4 py-3 text-[13px] leading-relaxed text-ink-muted">
            You answered {Math.round(result.completeness * 100)}% of the
            questions. Skipped inputs did not block the audit — they lowered the
            confidence of findings that needed them, were excluded from the
            score rather than counted as zero, and became questions further
            down.
          </p>
        ) : null}

        {/* ── 2 · What matters most ─────────────────────────────────── */}
        {result.topOpportunities.length > 0 ? (
          <section className="mt-16">
            <SectionHeading
              eyebrow={
                result.verdict.level === "healthy"
                  ? "Observations"
                  : `Top ${result.topOpportunities.length} findings`
              }
              title={
                result.verdict.level === "healthy"
                  ? "What we noticed, for completeness"
                  : "What is worth looking at first"
              }
            >
              {result.verdict.level === "healthy"
                ? "None of these clears the bar for action. They are here so you can see what the audit examined, and so a change in six months is visible against them."
                : "Ordered by how loud the signal is, not by how easy the fix is. Sequencing comes after."}
            </SectionHeading>

            {result.opportunityHigh > 0 ? (
              <EstimateCaveat className="mb-7" />
            ) : null}

            <div className="space-y-8">
              {result.topOpportunities.map((f, i) => (
                <FindingCard key={f.id} finding={f} index={i} defaultOpen={i === 0} />
              ))}
            </div>
          </section>
        ) : (
          <section className="mt-16">
            <SectionHeading eyebrow="Findings" title="Nothing stood out">
              On the dimensions we could measure, none of the detectors fired.
              That is a real result rather than a failure of the tool — the
              questions further down are where the remaining uncertainty sits.
            </SectionHeading>
          </section>
        )}

        {/* ── 3 · Prioritization ────────────────────────────────────── */}
        {result.findings.length > 1 ? (
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

        {/* ── 4 · Economic snapshot ─────────────────────────────────── */}
        {result.metrics.length > 0 ? (
          <section className="mt-16">
            <SectionHeading
              eyebrow="Economic snapshot"
              title="Your practice, in the numbers it implies"
            >
              Everything below is computed from what you entered. Nothing is
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
                      <ProvenanceMark kind="estimated" />
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
              <div className="border-t border-rule px-6 py-3 sm:px-8">
                <ProvenanceKey />
              </div>
            </div>
          </section>
        ) : null}

        {/* ── 5 · Time leaks ────────────────────────────────────────── */}
        {timeLeaks.length > 0 ? (
          <section className="mt-16">
            <SectionHeading eyebrow="Time leaks" title="Where the hours are going">
              Annualised from what you reported. Hours are the currency that
              matters here — dollars are downstream of them.
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

        {/* ── 6 · Automation ────────────────────────────────────────── */}
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
                    <h3 className="text-[16px] font-semibold text-ink">{c.label}</h3>
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

        {/* ── 7 · Open questions ────────────────────────────────────── */}
        <section className="mt-16 print-break-before">
          <SectionHeading
            eyebrow="Open questions"
            title="What this audit cannot tell you"
          >
            Seventeen questions cannot describe a practice. These are the gaps
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

        {/* ── 8 · Plan ──────────────────────────────────────────────── */}
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
                  <p className="text-[13px] font-semibold text-accent">{item.week}</p>
                  <p className="mt-0.5 text-[12px] text-ink-faint">{item.owner}</p>
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

        {/* ── 9 · Conversion ────────────────────────────────────────── */}
        <ConversionModule result={result} reportParam={reportParam} />

        {/* ── 10 · Assumptions ──────────────────────────────────────── */}
        <section className="mt-16 print-break-before">
          <SectionHeading
            eyebrow="Assumptions"
            title="Change any of these and the whole report moves"
          >
            If you disagree with a figure above, the assumption behind it is
            here. That is the point of this section — a model you cannot argue
            with is not worth reading.
          </SectionHeading>
          <AssumptionsPanel
            assumptions={assumptions}
            metrics={result.metrics}
            score={result.score}
            onChange={setAssumption}
            onReset={() => {
              setAssumptions(DEFAULT_ASSUMPTIONS);
              track({ name: "assumptions_reset" });
            }}
            dirty={dirty}
          />
        </section>

        {/* ── 11 · Score detail (methodology-adjacent) ──────────────── */}
        <section className="mt-16">
          <SectionHeading
            eyebrow="Score detail"
            title="How the six dimensions were scored"
          >
            Each dimension is scored against a published curve rather than
            against other practices. We hold no benchmark data set, and would
            rather say so than invent one.
          </SectionHeading>
          <ScorePanel score={result.score} />
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
          </div>
        </footer>
      </main>
    </div>
  );
}
