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
  pilotHealth,
  verdictDistribution,
} from "@/lib/pilot/analyse";
import { pilotGuidance } from "@/lib/pilot/guidance";
import { pilotStore } from "@/lib/pilot/store";

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

export default async function PilotPage() {
  const store = pilotStore();
  const { sessions, outcomes } = await store.readAll();

  const health = pilotHealth(sessions);
  const verdicts = verdictDistribution(sessions);
  const coverage = coverageInsight(sessions);
  const findings = findingInsight(sessions);
  const assumptions = assumptionChallenges(sessions);
  const conversion = conversionBreakdowns(sessions);
  const guidance = pilotGuidance(sessions, outcomes);

  const minutes = (ms: number | null) =>
    ms === null ? "—" : `${(ms / 60_000).toFixed(1)}m`;
  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

  return (
    <InternalShell
      title="Pilot"
      subtitle={`What we are learning from real practices. Demo sessions are excluded from every figure below. Model ${MODEL_VERSION}.`}
      actions={
        <>
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
            detail={`${health.demoSessions} demo session${health.demoSessions === 1 ? "" : "s"} excluded`}
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
        note="Newest first. Open a brief to record what the discovery conversation actually said."
      >
        <Table
          head={["Session", "Verdict", "Score", "Leading", "Source", "Lead", ""]}
          minWidth={860}
        >
          {sessions.length === 0 ? (
            <Row>
              <Cell first muted>
                Nothing recorded yet
              </Cell>
              <Cell muted>—</Cell>
              <Cell muted>—</Cell>
              <Cell muted>—</Cell>
              <Cell muted>—</Cell>
              <Cell muted>—</Cell>
              <Cell muted>—</Cell>
            </Row>
          ) : (
            sessions.slice(0, 60).map((s) => (
              <Row key={s.sessionId}>
                <Cell first>
                  <span className="tnum text-[12.5px]">
                    {s.sessionId.slice(3, 11)}
                  </span>
                  <span className="ml-2 text-[12px] text-ink-faint">
                    {new Date(s.completedAt).toLocaleDateString()}
                  </span>
                  {s.isDemo ? (
                    <span className="ml-2 text-[10.5px] uppercase tracking-wide text-signal-mid">
                      demo
                    </span>
                  ) : null}
                </Cell>
                <Cell muted>{s.snapshot.verdict.replace(/_/g, " ")}</Cell>
                <Cell>{s.snapshot.score ?? "—"}</Cell>
                <Cell muted>{s.snapshot.topCategory ?? "—"}</Cell>
                <Cell muted>{s.attribution.source ?? "—"}</Cell>
                <Cell muted>{s.leadSubmittedAt ? "yes" : s.ctaClickedAt ? "cta" : "—"}</Cell>
                <Cell>
                  <Link
                    href={`/internal/brief?a=${encodeURIComponent(s.report)}&s=${s.sessionId}`}
                    // Sixty rows prefetching sixty briefs is pure waste on an
                    // operator table nobody scrolls looking for links.
                    prefetch={false}
                    className="inline-flex min-h-11 items-center justify-end text-[13px] font-semibold text-accent no-underline"
                  >
                    Brief
                  </Link>
                </Cell>
              </Row>
            ))
          )}
        </Table>
      </Panel>
    </InternalShell>
  );
}
