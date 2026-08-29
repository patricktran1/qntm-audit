import Link from "next/link";
import {
  Cell,
  CountBar,
  EmptyState,
  InternalShell,
  Panel,

  Row,
  StatTile,
  StoreBanner,
  Table,
  TileGrid,
} from "@/components/internal/primitives";
import { MODEL_VERSION } from "@/lib/engine/version";
import { SMALL_SAMPLE, calibration, formatRatio } from "@/lib/pilot/analyse";
import { pilotStore } from "@/lib/pilot/store";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Calibration — QNTM internal",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Where the model's predictions meet real conversations. Nothing here retrains
 * or mutates the engine — it exposes disagreement so a human decides what to
 * change, and the change goes through MODEL_CHANGELOG.
 */
export default async function CalibrationPage() {
  const store = pilotStore();
  const { sessions, outcomes } = await store.readAll();
  const c = calibration(sessions, outcomes);

  const tooFew = c.comparable < 5;

  return (
    <InternalShell
      title="Calibration"
      subtitle={`Predicted pain versus what the discovery conversation actually said. Model ${MODEL_VERSION}. Nothing on this page changes the engine automatically.`}
      actions={
        <>
          <Link
            href="/internal/pilot"
            className="inline-flex min-h-11 items-center rounded-md border border-rule-strong px-3.5 text-[13px] font-medium text-ink-muted no-underline hover:text-ink"
          >
            Pilot
          </Link>
          <Link
            href="/internal/api/export?kind=outcomes"
            className="inline-flex min-h-11 items-center rounded-md border border-rule-strong px-3.5 text-[13px] font-medium text-ink-muted no-underline hover:text-ink"
          >
            Export CSV
          </Link>
        </>
      }
    >
      <StoreBanner configured={store.configured} />

      <Panel title="Sample">
        <TileGrid>
          <StatTile label="Outcomes recorded" value={c.labelled} />
          <StatTile
            label="Comparable calls"
            value={c.comparable}
            detail="a call happened and accuracy was assessable"
          />
          <StatTile
            label="Leading finding confirmed"
            value={c.comparable === 0 ? "—" : formatRatio(c.agreement)}
          />
          <StatTile
            label="Directionally right"
            value={c.comparable === 0 ? "—" : formatRatio(c.directional)}
          />
        </TileGrid>
        {tooFew ? (
          <p className="mt-4 rounded-lg border border-signal-mid/40 bg-signal-mid/5 px-5 py-3 text-[13.5px] leading-relaxed text-ink">
            Fewer than 5 comparable calls. Everything below is descriptive.
            Percentages are shown with their denominators and should not be read
            as rates until the sample is well past {SMALL_SAMPLE}.
          </p>
        ) : null}
      </Panel>

      <Panel
        title="Audit accuracy"
        note="How the leading finding held up once a real dermatologist responded to it."
      >
        {c.labelled === 0 ? (
          <EmptyState>
            No outcomes recorded yet. Record one from any brief after a call —
            this is the only place the model learns whether it was right.
          </EmptyState>
        ) : (
          <div className="space-y-3 rounded-lg border border-rule bg-paper-raised p-5">
            {c.accuracyTally.map((t) => (
              <CountBar
                key={t.key}
                label={t.label}
                count={t.count}
                total={c.labelled}
                tone={
                  t.key === "confirmed"
                    ? "strong"
                    : t.key === "incorrect"
                      ? "weak"
                      : "mid"
                }
              />
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="Predicted versus actual pain"
        note="Each row is one prediction paired with what the conversation concluded. Rows where they differ are the most useful data in the pilot."
      >
        <Table head={["Predicted leading category", "Actual primary pain", "Calls"]}>
          {c.confusion.length === 0 ? (
            <Row>
              <Cell first muted>
                No comparable calls yet
              </Cell>
              <Cell muted>—</Cell>
              <Cell muted>—</Cell>
            </Row>
          ) : (
            c.confusion.map((r) => (
              <Row key={`${r.predicted}-${r.actual}`}>
                <Cell first>{r.predicted}</Cell>
                <Cell muted>
                  <span
                    className={
                      r.predicted === r.actual ? "text-signal-strong" : "text-signal-weak"
                    }
                  >
                    {r.actual}
                  </span>
                </Cell>
                <Cell>{r.count}</Cell>
              </Row>
            ))
          )}
        </Table>
      </Panel>

      <Panel
        title="Verdict quality"
        note="For each verdict we issued, what the later conversation suggested. Sparse by design until enough calls exist."
      >
        <Table
          head={["Verdict", "Calls", "Material warranted", "Minor only", "No opportunity"]}
          minWidth={640}
        >
          {c.verdictQuality.map((v) => (
            <Row key={v.verdict}>
              <Cell first>{v.verdict.replace(/_/g, " ")}</Cell>
              <Cell>{v.total}</Cell>
              <Cell>{v.materialWarranted}</Cell>
              <Cell>{v.minorOnly}</Cell>
              <Cell>{v.noOpportunity}</Cell>
            </Row>
          ))}
        </Table>
      </Panel>

      <Panel
        title="Economic credibility"
        note="How prospects reacted to the estimate. Consistent 'too high' is the clearest signal that the economics need tightening."
      >
        {c.labelled === 0 ? (
          <EmptyState>No outcomes recorded yet.</EmptyState>
        ) : (
          <div className="space-y-3 rounded-lg border border-rule bg-paper-raised p-5">
            {c.economicTally.map((t) => (
              <CountBar
                key={t.key}
                label={t.label}
                count={t.count}
                total={c.labelled}
                tone={
                  t.key === "credible"
                    ? "strong"
                    : t.key === "too_high" || t.key === "not_useful"
                      ? "weak"
                      : "mid"
                }
              />
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="Assumption failure"
        note="Assumptions named as the most challenged on a call. Cross-reference with the slider-change table on the pilot page — an assumption that appears in both is a roadmap item."
      >
        <Table head={["Assumption", "Named on calls"]} minWidth={420}>
          {c.challengedAssumptions.length === 0 ? (
            <Row>
              <Cell first muted>
                None recorded yet
              </Cell>
              <Cell muted>—</Cell>
            </Row>
          ) : (
            c.challengedAssumptions.map((a) => (
              <Row key={a.key}>
                <Cell first>{a.label}</Cell>
                <Cell>{a.count}</Cell>
              </Row>
            ))
          )}
        </Table>
      </Panel>

      <Panel
        title="Service-fit agreement"
        note="False positives are the costly error: a service we led with that the conversation found irrelevant spends trust for nothing. Attach rate is not the metric here."
      >
        <TileGrid>
          <StatTile
            label="Calls where some service was relevant"
            value={c.comparable === 0 ? "—" : formatRatio(c.serviceAgreement)}
          />
          <StatTile
            label="Categories producing false positives"
            value={c.serviceFalsePositives.length}
          />
          <StatTile label="Call outcomes recorded" value={c.labelled} />
          <StatTile label="Model version" value={MODEL_VERSION} />
        </TileGrid>

        <div className="mt-4">
          <Table head={["We led with", "Calls concluding no service relevant"]} minWidth={420}>
            {c.serviceFalsePositives.length === 0 ? (
              <Row>
                <Cell first muted>
                  None recorded
                </Cell>
                <Cell muted>—</Cell>
              </Row>
            ) : (
              c.serviceFalsePositives.map((f) => (
                <Row key={f.service}>
                  <Cell first>{f.service}</Cell>
                  <Cell>{f.count}</Cell>
                </Row>
              ))
            )}
          </Table>
        </div>
      </Panel>

      <Panel title="Call outcomes">
        <Table head={["Outcome", "Count"]} minWidth={420}>
          {c.callOutcomeTally.map((t) => (
            <Row key={t.key}>
              <Cell first>{t.label}</Cell>
              <Cell>{t.count}</Cell>
            </Row>
          ))}
        </Table>
      </Panel>
    </InternalShell>
  );
}
