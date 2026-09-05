import Link from "next/link";
import {
  Cell,
  CountBar,
  EmptyState,
  InternalShell,
  Panel,
  RatioCell,
  Row,
  StatTile,
  StoreBanner,
  Table,
  TileGrid,
  Warning,
} from "@/components/internal/primitives";
import { MODEL_VERSION } from "@/lib/engine/version";
import {
  assumptionChallenges,
  conversionBreakdowns,
  coverageInsight,
  findingInsight,
  formatRatio,
  funnelInsight,
  isRealSession,
  pilotHealth,
  verdictDistribution,
} from "@/lib/pilot/analyse";
import { sanitizeAttributionValue, formatAttribution } from "@/lib/pilot/attribution";
import { pilotGuidance } from "@/lib/pilot/guidance";
import {
  SESSION_FILTERS,
  STATUS_LABELS,
  cohortSummary,
  knownCohorts,
  needsAttention,
  sessionStatus,
  stopConditions,
} from "@/lib/pilot/status";
import { pilotStore } from "@/lib/pilot/store";
import type { DiscoveryOutcome, PilotSession } from "@/lib/pilot/types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pilot — QNTM internal",
  robots: { index: false, follow: false, nocache: true },
};

const SEVERITY_STYLE = {
  blocking: "border-signal-weak/40 bg-signal-weak/5 text-signal-weak",
  investigate: "border-signal-mid/40 bg-signal-mid/5 text-signal-mid",
  watch: "border-rule-strong bg-paper-sunk text-ink-faint",
} as const;

function SessionRow({
  s,
  outcome,
}: {
  s: PilotSession;
  outcome: DiscoveryOutcome | undefined;
}) {
  const status = sessionStatus(s, outcome);
  return (
    <Row>
      <Cell first>
        <span className="tnum text-[12.5px]">{s.sessionId.slice(3, 11)}</span>
        <span className="ml-2 text-[12px] text-ink-faint">
          {new Date(s.completedAt).toLocaleDateString()}
        </span>
        {s.isDemo ? (
          <span className="ml-2 text-[10.5px] uppercase tracking-wide text-signal-mid">
            demo
          </span>
        ) : null}
        {s.isTest === true ? (
          <span className="ml-2 text-[10.5px] uppercase tracking-wide text-signal-mid">
            test
          </span>
        ) : null}
      </Cell>
      <Cell muted>{STATUS_LABELS[status]}</Cell>
      <Cell muted>{s.snapshot.verdict.replace(/_/g, " ")}</Cell>
      <Cell>{s.snapshot.score ?? "—"}</Cell>
      <Cell muted>{s.snapshot.topCategory ?? "—"}</Cell>
      <Cell muted>{Math.round(s.snapshot.coverage * 100)}%</Cell>
      <Cell muted>
        <span className="tnum text-[12px]">{formatAttribution(s.attribution)}</span>
      </Cell>
      <Cell muted>
        <span className="tnum text-[12px]">{s.snapshot.modelVersion}</span>
      </Cell>
      <Cell>
        <span className="flex items-center justify-end gap-3 whitespace-nowrap">
          <Link
            href={`/internal/call?s=${s.sessionId}`}
            prefetch={false}
            className="inline-flex min-h-11 items-center text-[13px] font-semibold text-accent no-underline"
          >
            Call
          </Link>
          <Link
            href={`/internal/brief?a=${encodeURIComponent(s.report)}&s=${s.sessionId}`}
            // Sixty rows prefetching sixty briefs is pure waste on an
            // operator table nobody scrolls looking for links.
            prefetch={false}
            className="inline-flex min-h-11 items-center text-[13px] font-semibold text-accent no-underline"
          >
            Brief
          </Link>
        </span>
      </Cell>
    </Row>
  );
}

const SESSION_HEAD = [
  "Session",
  "Status",
  "Verdict",
  "Score",
  "Leading",
  "Coverage",
  "Attribution",
  "Model",
  "",
];

export default async function PilotPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const activeFilter =
    typeof params.filter === "string"
      ? SESSION_FILTERS.find((f) => f.key === params.filter) ?? null
      : null;
  const activeCohort =
    typeof params.cohort === "string"
      ? sanitizeAttributionValue(params.cohort) ?? null
      : null;

  const store = pilotStore();
  const { sessions, outcomes, progress } = await store.readAll();
  const outcomeById = new Map(outcomes.map((o) => [o.sessionId, o]));

  const health = pilotHealth(sessions);
  const verdicts = verdictDistribution(sessions);
  const coverage = coverageInsight(sessions);
  const findings = findingInsight(sessions);
  const assumptions = assumptionChallenges(sessions);
  const conversion = conversionBreakdowns(sessions);
  const guidance = pilotGuidance(sessions, outcomes, progress);
  const funnel = funnelInsight(progress);
  const attention = needsAttention(sessions, outcomes);
  const stops = stopConditions(sessions, outcomes, progress);
  const triggeredStops = stops.filter((s) => s.triggered);
  const cohorts = knownCohorts(sessions);
  const cohortStats = activeCohort
    ? cohortSummary(sessions, outcomes, activeCohort)
    : null;

  const minutes = (ms: number | null) =>
    ms === null ? "—" : `${(ms / 60_000).toFixed(1)}m`;
  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

  // The list an operator scans. Filters apply over real sessions only; the
  // unfiltered list shows everything with demo/test rows flagged.
  const listed = activeFilter
    ? sessions
        .filter(isRealSession)
        .filter((s) => activeFilter.matches(s, outcomeById.get(s.sessionId)))
    : sessions;

  return (
    <InternalShell
      title="Pilot"
      subtitle={`What we are learning from real practices. Demo and test sessions are excluded from every figure below. Model ${MODEL_VERSION}.`}
      actions={
        <>
          <Link
            href="/internal/setup"
            className="inline-flex min-h-11 items-center rounded-md border border-rule-strong px-3.5 text-[13px] font-medium text-ink-muted no-underline hover:text-ink"
          >
            Setup
          </Link>
          <Link
            href="/internal/campaigns"
            className="inline-flex min-h-11 items-center rounded-md border border-rule-strong px-3.5 text-[13px] font-medium text-ink-muted no-underline hover:text-ink"
          >
            Campaigns
          </Link>
          <Link
            href="/internal/calibration"
            className="inline-flex min-h-11 items-center rounded-md border border-rule-strong px-3.5 text-[13px] font-medium text-ink-muted no-underline hover:text-ink"
          >
            Calibration
          </Link>
          <Link
            href="/internal/api/export?kind=sessions"
            className="inline-flex min-h-11 items-center rounded-md border border-rule-strong px-3.5 text-[13px] font-medium text-ink-muted no-underline hover:text-ink"
          >
            Export CSV
          </Link>
        </>
      }
    >
      <StoreBanner configured={store.configured} />

      {/* ── Needs attention ───────────────────────────────────────────── */}
      <Panel
        title="Needs attention"
        note="Deterministic follow-up queue: what happened and why it needs a human. What to do about it is the runbook's job, not this page's."
      >
        {attention.length === 0 ? (
          <EmptyState>
            Nothing waiting. Every lead has an outcome, every recorded call is
            complete, and no data-quality rule is firing.
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {attention.map((item, i) => (
              <li
                key={`${item.kind}-${item.sessionId}-${i}`}
                className={`rounded-lg border px-5 py-4 ${
                  item.kind === "lead_needs_response"
                    ? "border-signal-weak/40 bg-signal-weak/5"
                    : "border-rule bg-paper-raised"
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="text-[14.5px] font-semibold text-ink">
                    {item.headline}
                  </p>
                  <span className="tnum text-[12px] text-ink-faint">
                    {item.sessionId.slice(3, 11)}
                  </span>
                </div>
                <p className="tnum mt-1.5 text-[13px] leading-relaxed text-ink-muted">
                  {item.detail}
                </p>
                <div className="mt-2 flex gap-4">
                  <Link
                    href={`/internal/call?s=${item.sessionId}`}
                    prefetch={false}
                    className="text-[13px] font-semibold text-accent no-underline"
                  >
                    Call view
                  </Link>
                  <Link
                    href={`/internal/calibration`}
                    prefetch={false}
                    className="text-[13px] font-semibold text-accent no-underline"
                  >
                    Calibration
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* ── Stop conditions ───────────────────────────────────────────── */}
      <Panel
        title="Stop conditions"
        note="Operator guardrails, not statistical inference. Thresholds were set in advance so they cannot be argued with in the moment. Nothing stops automatically and nothing here touches the model."
      >
        {triggeredStops.length > 0 ? (
          <ul className="space-y-3">
            {triggeredStops.map((s) => (
              <li
                key={s.id}
                className="rounded-lg border border-signal-weak/40 bg-signal-weak/5 px-5 py-4"
              >
                <p className="text-[14.5px] font-semibold text-ink">{s.title}</p>
                <p className="tnum mt-1.5 text-[13px] leading-relaxed text-ink-muted">
                  {s.evidence}
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink">
                  {s.threshold}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>No stop condition is firing.</EmptyState>
        )}
        <details className="mt-3">
          <summary className="cursor-pointer text-[13px] font-medium text-ink-muted">
            All guardrails and their current readings
          </summary>
          <div className="mt-3 rounded-lg border border-rule bg-paper-raised px-5 py-2">
            {stops.map((s) => (
              <div
                key={s.id}
                className="flex gap-4 border-b border-rule py-3 last:border-b-0"
              >
                <span
                  className={`w-16 shrink-0 pt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] ${
                    s.triggered ? "text-signal-weak" : "text-ink-faint"
                  }`}
                >
                  {s.triggered ? "FIRING" : "QUIET"}
                </span>
                <div>
                  <p className="text-[13.5px] font-medium text-ink">{s.title}</p>
                  <p className="tnum mt-0.5 text-[12.5px] leading-relaxed text-ink-muted">
                    {s.evidence} {s.threshold}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </details>
      </Panel>

      {/* ── What we should learn next ─────────────────────────────────── */}
      <Panel
        title="What we should learn next"
        note="Deterministic rules over the data below. Every item shows the metric that triggered it; nothing here is generated advice."
      >
        <ul className="space-y-3">
          {guidance.map((g) => (
            <li
              key={g.id}
              className={`rounded-lg border px-5 py-4 ${SEVERITY_STYLE[g.severity]}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-[15px] font-semibold text-ink">{g.headline}</p>
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em]">
                  {g.severity}
                </span>
              </div>
              <p className="tnum mt-1.5 text-[13px] leading-relaxed text-ink-muted">
                {g.evidence}
              </p>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink">
                {g.action}
              </p>
            </li>
          ))}
        </ul>
      </Panel>

      {/* ── Cohort view ───────────────────────────────────────────────── */}
      <Panel
        title="Cohorts"
        note="A named cohort is a label for analysis, not a target to hit. Invitation counts are not tracked — links are generated and sent by hand, outside the product — so the funnel here begins at completion."
      >
        <div className="flex flex-wrap gap-2">
          {cohorts.length === 0 && !activeCohort ? (
            <p className="text-[13px] text-ink-faint">
              No cohort attribution recorded yet. Generate links with
              cohort=first10 on the campaigns page.
            </p>
          ) : (
            ["first10", ...cohorts.filter((c) => c !== "first10")].map((c) => (
              <Link
                key={c}
                href={activeCohort === c ? "/internal/pilot" : `/internal/pilot?cohort=${c}`}
                prefetch={false}
                className={`inline-flex min-h-11 items-center rounded-md border px-3.5 text-[13px] font-medium no-underline ${
                  activeCohort === c
                    ? "border-accent text-accent"
                    : "border-rule-strong text-ink-muted hover:text-ink"
                }`}
              >
                {c}
              </Link>
            ))
          )}
        </div>

        {cohortStats ? (
          <div className="mt-4">
            <TileGrid>
              <StatTile label="Completions" value={cohortStats.completions} />
              <StatTile
                label="Leads"
                value={cohortStats.leads.numerator}
                detail={formatRatio(cohortStats.leads)}
              />
              <StatTile
                label="Outcomes recorded"
                value={cohortStats.outcomesRecorded.numerator}
                detail={formatRatio(cohortStats.outcomesRecorded)}
              />
              <StatTile
                label="Assumption changes"
                value={cohortStats.assumptionChanges}
              />
            </TileGrid>
            <div className="mt-3 rounded-lg border border-rule bg-paper-raised p-5">
              <p className="tnum text-[13px] leading-relaxed text-ink-muted">
                Among comparable recorded calls: prediction agreed{" "}
                {formatRatio(cohortStats.agreements)}, disagreed{" "}
                {formatRatio(cohortStats.disagreements)}. Where economics were
                discussed: credible {formatRatio(cohortStats.economicsCredible)},
                challenged {formatRatio(cohortStats.economicsChallenged)}.
              </p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink-faint">
                At this sample size the rows below matter more than the
                aggregate. Read who disagreed, and why, before reading any rate.
              </p>
            </div>
            <div className="mt-4">
              <Table head={SESSION_HEAD} minWidth={1080}>
                {sessions
                  .filter(isRealSession)
                  .filter((s) => s.attribution.cohort === activeCohort)
                  .map((s) => (
                    <SessionRow
                      key={s.sessionId}
                      s={s}
                      outcome={outcomeById.get(s.sessionId)}
                    />
                  ))}
              </Table>
            </div>
          </div>
        ) : null}
      </Panel>

      {/* ── Pilot health ──────────────────────────────────────────────── */}
      <Panel
        title="Pilot health"
        note="Counts first. With a sample this size a percentage on its own would be misleading."
      >
        <TileGrid>
          <StatTile label="Completed audits" value={health.completedAudits} />
          <StatTile
            label="CTA clicks"
            value={health.ctaClicks}
            detail={formatRatio(health.ctaRate)}
          />
          <StatTile
            label="Leads"
            value={health.leads}
            detail={formatRatio(health.leadRate)}
          />
          <StatTile
            label="Median time to complete"
            value={minutes(health.medianDurationMs)}
            detail={`${health.demoSessions} demo, ${health.testSessions} test excluded`}
          />
        </TileGrid>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Table head={["Experiment arm", "Completed audits"]} minWidth={320}>
            {health.variantSplit.length === 0 ? (
              <Row>
                <Cell first muted>
                  No data yet
                </Cell>
                <Cell muted>—</Cell>
              </Row>
            ) : (
              health.variantSplit.map((v) => (
                <Row key={v.variant}>
                  <Cell first>{v.variant}</Cell>
                  <Cell>{v.count}</Cell>
                </Row>
              ))
            )}
          </Table>

          <Table head={["Source / campaign", "Completed audits"]} minWidth={320}>
            {health.sources.length === 0 ? (
              <Row>
                <Cell first muted>
                  No data yet
                </Cell>
                <Cell muted>—</Cell>
              </Row>
            ) : (
              health.sources.slice(0, 8).map((s) => (
                <Row key={s.label}>
                  <Cell first>{s.label}</Cell>
                  <Cell>{s.count}</Cell>
                </Row>
              ))
            )}
          </Table>
        </div>
      </Panel>

      {/* ── Verdict distribution ──────────────────────────────────────── */}
      <Panel
        title="Verdict distribution"
        note="The honesty metric. If the audit stops being able to conclude that a practice should not buy anything, it has become a sales tool."
      >
        {verdicts.integrityWarning ? (
          <div className="mb-4">
            <Warning>{verdicts.integrityWarning}</Warning>
          </div>
        ) : null}
        {verdicts.total === 0 ? (
          <EmptyState>
            No completed audits recorded yet. This panel is the first thing to
            check once outreach begins.
          </EmptyState>
        ) : (
          <div className="space-y-3 rounded-lg border border-rule bg-paper-raised p-5">
            {verdicts.tallies.map((t) => (
              <CountBar
                key={t.key}
                label={t.label}
                count={t.count}
                total={verdicts.total}
                tone={
                  t.key === "healthy"
                    ? "strong"
                    : t.key === "act"
                      ? "accent"
                      : t.key === "insufficient_data"
                        ? "weak"
                        : "mid"
                }
              />
            ))}
            <p className="border-t border-rule pt-3 text-[12.5px] leading-relaxed text-ink-muted">
              Among audits with enough coverage to reach a verdict: healthy{" "}
              {formatRatio(verdicts.healthyAmongSufficient)}, act{" "}
              {formatRatio(verdicts.actAmongSufficient)}.
            </p>
          </div>
        )}
      </Panel>

      {/* ── Funnel ────────────────────────────────────────────────────── */}
      <Panel
        title="Where the questionnaire loses people"
        note="Every other panel on this page is computed over completions. This one is the only place that can see the people the questionnaire lost — the difference between a model that is wrong and a form that is too long."
      >
        {funnel.starts === 0 ? (
          <EmptyState>
            No starts recorded yet. A record is written as soon as someone
            advances past the first question, whether or not they finish.
          </EmptyState>
        ) : (
          <>
            <TileGrid>
              <StatTile label="Started the questionnaire" value={funnel.starts} />
              <StatTile
                label="Finished"
                value={funnel.completions.numerator}
                detail={formatRatio(funnel.completions)}
              />
              <StatTile
                label="Abandoned"
                value={funnel.abandonment.numerator}
                detail={formatRatio(funnel.abandonment)}
              />
              <StatTile
                label="Most common stopping point"
                value={funnel.worstStep ? funnel.worstStep.stoppedHere : "—"}
                detail={funnel.worstStep ? funnel.worstStep.label : "nobody has stopped"}
              />
            </TileGrid>

            <div className="mt-4">
              <Table
                head={["Step", "Reached", "Of all starts", "Stopped here"]}
                minWidth={560}
              >
                {funnel.steps.map((f) => (
                  <Row key={f.stepId}>
                    <Cell first>{f.label}</Cell>
                    <Cell>{f.reached}</Cell>
                    <Cell>
                      <RatioCell value={f.reachedRate} />
                    </Cell>
                    <Cell muted={f.stoppedHere === 0}>
                      {f.stoppedHere === 0 ? "—" : f.stoppedHere}
                    </Cell>
                  </Row>
                ))}
              </Table>
            </div>

            {funnel.unknownAmongAbandoned.length > 0 ? (
              <div className="mt-4">
                <p className="mb-2 text-[12px] uppercase tracking-[0.1em] text-ink-faint">
                  Marked &ldquo;I don&apos;t know&rdquo; by people who did not finish
                </p>
                <Table head={["Question", "Count"]} minWidth={320}>
                  {funnel.unknownAmongAbandoned.map((u) => (
                    <Row key={u.field}>
                      <Cell first>{u.label}</Cell>
                      <Cell>{u.count}</Cell>
                    </Row>
                  ))}
                </Table>
              </div>
            ) : null}

            <p className="mt-3 text-[12.5px] leading-relaxed text-ink-faint">
              Progress records hold question keys only — never an answer. A
              visitor who abandons leaves behind where they stopped and nothing
              about their practice.
            </p>
          </>
        )}
      </Panel>

      {/* ── Coverage ──────────────────────────────────────────────────── */}
      <Panel
        title="Coverage"
        note="What dermatologists actually know about their own businesses. A question most practices cannot answer is a finding about the specialty, not only a gap in the form."
      >
        <TileGrid>
          <StatTile label="Median model coverage" value={pct(coverage.medianCoverage)} />
          <StatTile
            label="Median questions answered"
            value={pct(coverage.medianCompleteness)}
          />
          <StatTile
            label="Verdict withheld"
            value={coverage.insufficientRate.numerator}
            detail={formatRatio(coverage.insufficientRate)}
          />
          <StatTile
            label="Dimensions unscored"
            value={coverage.mostUnscored.length}
            detail="distinct dimensions with at least one gap"
          />
        </TileGrid>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Table head={["Most often unanswered", "Count"]} minWidth={320}>
            {coverage.mostSkipped.length === 0 ? (
              <Row>
                <Cell first muted>
                  No data yet
                </Cell>
                <Cell muted>—</Cell>
              </Row>
            ) : (
              coverage.mostSkipped.map((s) => (
                <Row key={s.field}>
                  <Cell first>{s.label}</Cell>
                  <Cell>{s.count}</Cell>
                </Row>
              ))
            )}
          </Table>
          <Table head={["Dimension most often unscored", "Count"]} minWidth={320}>
            {coverage.mostUnscored.length === 0 ? (
              <Row>
                <Cell first muted>
                  No data yet
                </Cell>
                <Cell muted>—</Cell>
              </Row>
            ) : (
              coverage.mostUnscored.map((d) => (
                <Row key={d.key}>
                  <Cell first>{d.key.replace(/_/g, " ")}</Cell>
                  <Cell>{d.count}</Cell>
                </Row>
              ))
            )}
          </Table>
        </div>
      </Panel>

      {/* ── Findings ──────────────────────────────────────────────────── */}
      <Panel
        title="Findings"
        note="Present anywhere in the report versus leading it. These are different questions, and only the second one shapes what a physician remembers."
      >
        {findings.dominanceWarning ? (
          <div className="mb-4">
            <Warning>{findings.dominanceWarning}</Warning>
          </div>
        ) : null}
        <Table head={["Category", "Present in", "Leads"]}>
          {findings.present.length === 0 ? (
            <Row>
              <Cell first muted>
                No data yet
              </Cell>
              <Cell muted>—</Cell>
              <Cell muted>—</Cell>
            </Row>
          ) : (
            findings.present.map((p) => (
              <Row key={p.category}>
                <Cell first>{p.category}</Cell>
                <Cell>{p.count}</Cell>
                <Cell>
                  {findings.leading.find((l) => l.category === p.category)?.count ?? 0}
                </Cell>
              </Row>
            ))
          )}
        </Table>
      </Panel>

      {/* ── Assumption challenges ─────────────────────────────────────── */}
      <Panel
        title="Assumption challenges"
        note="Which priors physicians push back on. A frequently changed assumption is not necessarily wrong — it may mean their mental model differs from ours, which is worth knowing either way."
      >
        <Table head={["Assumption", "Changed", "Direction", "Median change"]}>
          {assumptions.map((a) => (
            <Row key={a.key}>
              <Cell first>{a.label}</Cell>
              <Cell>
                <RatioCell value={a.changeRate} />
              </Cell>
              <Cell muted>{a.medianDirection ?? "—"}</Cell>
              <Cell muted>
                {a.medianRelativeChange === null
                  ? "—"
                  : `${a.medianRelativeChange > 0 ? "+" : ""}${Math.round(
                      a.medianRelativeChange * 100,
                    )}%`}
              </Cell>
            </Row>
          ))}
        </Table>
      </Panel>

      {/* ── Conversion ────────────────────────────────────────────────── */}
      <Panel
        title="Conversion"
        note="Raw counts by segment. No significance is computed and none should be inferred at this sample size."
      >
        <div className="space-y-4">
          {(
            [
              ["By verdict", conversion.byVerdict],
              ["By leading category", conversion.byTopCategory],
              ["By model coverage", conversion.byCoverage],
              ["By experiment arm", conversion.byVariant],
              ["By source", conversion.bySource],
            ] as const
          ).map(([label, rows]) => (
            <div key={label}>
              <p className="mb-2 text-[12px] uppercase tracking-[0.1em] text-ink-faint">
                {label}
              </p>
              <Table head={[label, "Audits", "CTA", "Leads"]}>
                {rows.length === 0 ? (
                  <Row>
                    <Cell first muted>
                      No data yet
                    </Cell>
                    <Cell muted>—</Cell>
                    <Cell muted>—</Cell>
                    <Cell muted>—</Cell>
                  </Row>
                ) : (
                  rows.map((r) => (
                    <Row key={r.label}>
                      <Cell first>{r.label}</Cell>
                      <Cell>{r.sessions}</Cell>
                      <Cell>
                        <RatioCell value={r.ctaClicks} />
                      </Cell>
                      <Cell>
                        <RatioCell value={r.leads} />
                      </Cell>
                    </Row>
                  ))
                )}
              </Table>
            </div>
          ))}
        </div>
      </Panel>

      {/* ── Session list ──────────────────────────────────────────────── */}
      <Panel
        title="Sessions"
        note="Newest first. Filters answer one operator question each and apply to real sessions only; the unfiltered list shows demo and test rows flagged."
      >
        <div className="mb-4 flex flex-wrap gap-2">
          <Link
            href="/internal/pilot"
            prefetch={false}
            className={`inline-flex min-h-11 items-center rounded-md border px-3.5 text-[13px] font-medium no-underline ${
              activeFilter === null
                ? "border-accent text-accent"
                : "border-rule-strong text-ink-muted hover:text-ink"
            }`}
          >
            All ({sessions.length})
          </Link>
          {SESSION_FILTERS.map((f) => {
            const count = sessions
              .filter(isRealSession)
              .filter((s) => f.matches(s, outcomeById.get(s.sessionId))).length;
            return (
              <Link
                key={f.key}
                href={`/internal/pilot?filter=${f.key}`}
                prefetch={false}
                className={`inline-flex min-h-11 items-center rounded-md border px-3.5 text-[13px] font-medium no-underline ${
                  activeFilter?.key === f.key
                    ? "border-accent text-accent"
                    : "border-rule-strong text-ink-muted hover:text-ink"
                }`}
              >
                {f.label} ({count})
              </Link>
            );
          })}
        </div>

        <Table head={SESSION_HEAD} minWidth={1080}>
          {listed.length === 0 ? (
            <Row>
              <Cell first muted>
                {activeFilter
                  ? `No session matches "${activeFilter.label}"`
                  : "Nothing recorded yet"}
              </Cell>
              {SESSION_HEAD.slice(1).map((_, i) => (
                <Cell key={i} muted>
                  —
                </Cell>
              ))}
            </Row>
          ) : (
            listed
              .slice(0, 60)
              .map((s) => (
                <SessionRow
                  key={s.sessionId}
                  s={s}
                  outcome={outcomeById.get(s.sessionId)}
                />
              ))
          )}
        </Table>
        <p className="mt-3 text-[12.5px] leading-relaxed text-ink-faint">
          Statuses begin at completion — a session record exists only once an
          audit is finished. Everyone who started is in the funnel panel above.
          Invitations are still not knowable: links are sent by hand.
        </p>
      </Panel>
    </InternalShell>
  );
}
