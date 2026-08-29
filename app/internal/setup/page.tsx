import Link from "next/link";
import { headers } from "next/headers";
import {
  InternalShell,
  Panel,
  Warning,
} from "@/components/internal/primitives";
import {
  ClearTestButton,
  TestDeviceToggle,
  TestLeadButton,
} from "@/components/internal/setup-actions";
import { readinessReport, type Check } from "@/lib/pilot/readiness";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Setup — QNTM internal",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * PRODUCTION READINESS
 *
 * One page that answers "can I safely invite the first real dermatologist?"
 * Every check runs live at request time; nothing is cached and nothing shown
 * here contains a secret.
 */

const STATUS_STYLE: Record<Check["status"], { label: string; className: string }> = {
  ok: { label: "OK", className: "text-signal-strong" },
  warn: { label: "WARN", className: "text-signal-mid" },
  fail: { label: "MISSING", className: "text-signal-weak" },
  off: { label: "OFF", className: "text-ink-faint" },
};

function CheckRow({ check }: { check: Check }) {
  const style = STATUS_STYLE[check.status];
  return (
    <div className="flex gap-4 border-b border-rule py-3 last:border-b-0">
      <span
        className={`w-16 shrink-0 pt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] ${style.className}`}
      >
        {style.label}
      </span>
      <div className="min-w-0">
        <p className="text-[13.5px] font-medium text-ink">{check.name}</p>
        <p className="tnum mt-0.5 text-[13px] leading-relaxed text-ink-muted">
          {check.detail}
        </p>
      </div>
    </div>
  );
}

function CheckList({ checks }: { checks: Check[] }) {
  return (
    <div className="rounded-lg border border-rule bg-paper-raised px-5 py-2">
      {checks.map((c) => (
        <CheckRow key={c.name} check={c} />
      ))}
    </div>
  );
}

export default async function SetupPage() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const report = await readinessReport(host);

  return (
    <InternalShell
      title="Setup"
      subtitle="Production readiness, checked live on every load. The question this page answers: can the first real dermatologist be invited safely?"
      actions={
        <Link
          href="/internal/pilot"
          className="inline-flex min-h-11 items-center rounded-md border border-rule-strong px-3.5 text-[13px] font-medium text-ink-muted no-underline hover:text-ink"
        >
          Pilot dashboard
        </Link>
      }
    >
      {/* ── Verdict ────────────────────────────────────────────────────── */}
      <Panel title={report.ready ? "Ready" : "Not ready"}>
        {report.ready ? (
          <div className="rounded-lg border border-signal-strong/40 bg-signal-strong/5 px-5 py-4">
            <p className="text-[15px] font-semibold text-ink">
              Every hard requirement passes.
            </p>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-muted">
              Before the first real invitation, walk the checklist in
              PILOT_RUNBOOK.md: complete one end-to-end test audit from a marked
              test browser, verify it appears on the dashboard, record a test
              outcome, then clear test records below.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-signal-weak/40 bg-signal-weak/5 px-5 py-4">
            <p className="text-[15px] font-semibold text-ink">
              {report.blockers.length} blocker{report.blockers.length === 1 ? "" : "s"} before
              real outreach:
            </p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-ink-muted">
              {report.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-faint">
              Exact configuration steps: docs/PILOT_SETUP.md in the repository.
            </p>
          </div>
        )}
      </Panel>

      {/* ── Internal access ────────────────────────────────────────────── */}
      <Panel
        title="Internal access"
        note="The shared secret behind every /internal surface. Its value is never rendered anywhere, this page included."
      >
        <CheckList checks={[report.internalAccess]} />
      </Panel>

      {/* ── Pilot store ────────────────────────────────────────────────── */}
      <Panel
        title="Pilot store"
        note="Where completed audits and discovery outcomes live. The round trip below writes, reads, and deletes a probe key on every page load — it never touches pilot data."
      >
        <CheckList checks={report.store} />
        {report.counts ? (
          <p className="tnum mt-3 text-[13px] leading-relaxed text-ink-muted">
            Currently holding {report.counts.sessions} session
            {report.counts.sessions === 1 ? "" : "s"} ({report.counts.demo} demo,{" "}
            {report.counts.test} test) and {report.counts.outcomes} outcome
            {report.counts.outcomes === 1 ? "" : "s"}.
          </p>
        ) : null}
      </Panel>

      {/* ── Lead delivery ──────────────────────────────────────────────── */}
      <Panel
        title="Lead delivery"
        note="Where a physician's request to talk actually goes. The test sends a notification headlined [TEST] through every configured sink; it creates no lead record anywhere."
      >
        <CheckList checks={report.leadSinks} />
        {report.lastLeadTest ? (
          <p className="tnum mt-3 text-[13px] leading-relaxed text-ink-muted">
            Last test: {report.lastLeadTest.ok ? "succeeded" : "failed"} at{" "}
            {new Date(report.lastLeadTest.at).toLocaleString()} — delivered to [
            {report.lastLeadTest.sinks.join(", ") || "none"}]
            {report.lastLeadTest.failures.length > 0
              ? `, failed for [${report.lastLeadTest.failures.join(", ")}]`
              : ""}
            .
          </p>
        ) : (
          <p className="mt-3 text-[13px] leading-relaxed text-ink-faint">
            No test recorded yet{report.counts ? "" : " (a configured store is required to remember one)"}.
          </p>
        )}
        <div className="mt-4">
          <TestLeadButton />
        </div>
      </Panel>

      {/* ── Analytics ──────────────────────────────────────────────────── */}
      <Panel
        title="Analytics"
        note="Optional. Events are banded by construction; the pilot store, not analytics, carries the learning loop."
      >
        <CheckList checks={report.analytics} />
      </Panel>

      {/* ── Site URL ───────────────────────────────────────────────────── */}
      <Panel
        title="Site URL"
        note="Used for campaign links and the brief link inside lead notifications."
      >
        <CheckList checks={[report.siteUrl]} />
      </Panel>

      {/* ── Model ──────────────────────────────────────────────────────── */}
      <Panel
        title="Model"
        note="What the pilot is collecting evidence against."
      >
        <CheckList checks={report.model} />
      </Panel>

      {/* ── Security ───────────────────────────────────────────────────── */}
      <Panel title="Security posture">
        <CheckList checks={report.security} />
        {process.env.NODE_ENV !== "production" &&
        !process.env.INTERNAL_ACCESS_TOKEN ? (
          <div className="mt-3">
            <Warning>
              This is a development build with no token — internal surfaces are
              open. Production behaves differently: it fails closed.
            </Warning>
          </div>
        ) : null}
      </Panel>

      {/* ── Test data ──────────────────────────────────────────────────── */}
      <Panel
        title="Test data"
        note="QA traffic must never pollute calibration. Mark any browser you test from; clear its records before real outreach begins."
      >
        <div className="space-y-5">
          <TestDeviceToggle />
          <ClearTestButton testCount={report.counts?.test ?? 0} />
        </div>
      </Panel>

      <p className="tnum mt-10 border-t border-rule pt-4 text-[12px] text-ink-faint">
        Checks generated {new Date(report.generatedAt).toLocaleString()} — reload
        for a fresh run. CLI equivalent: <code>npm run pilot:check</code>.
      </p>
    </InternalShell>
  );
}
