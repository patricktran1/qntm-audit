import Link from "next/link";
import { buildBrief } from "@/lib/engine/brief";
import { runAudit } from "@/lib/engine/audit";
import { decodeAnswers } from "@/lib/share";
import { isSessionId } from "@/lib/pilot/attribution";
import { pilotStore } from "@/lib/pilot/store";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Call — QNTM internal",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * DISCOVERY CALL VIEW
 *
 * The instrument panel for a twenty-minute call: one column, big type, only
 * what is usable while actually speaking. The full brief exists for
 * preparation; this page exists for the moment the phone is ringing.
 *
 * Reached with ?s=<sessionId> (looks the report up in the pilot store) or
 * ?a=<encoded answers> (works with no store at all).
 */

function Block({
  eyebrow,
  children,
  tone = "default",
}: {
  eyebrow: string;
  children: React.ReactNode;
  tone?: "default" | "caution";
}) {
  return (
    <section
      className={`mt-5 rounded-lg border p-5 ${
        tone === "caution"
          ? "border-signal-mid/40 bg-signal-mid/5"
          : "border-rule bg-paper-raised"
      }`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
        {eyebrow}
      </p>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

export default async function CallPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string; a?: string }>;
}) {
  const { s, a } = await searchParams;
  const sessionId = isSessionId(s) ? s : "";
  const store = pilotStore();

  // Prefer the stored session: it carries the exact report the physician saw.
  let encoded = "";
  if (sessionId && store.configured) {
    const { sessions } = await store.readAll();
    encoded = sessions.find((row) => row.sessionId === sessionId)?.report ?? "";
  }
  if (!encoded && typeof a === "string") encoded = a;

  const answers = decodeAnswers(encoded);
  if (!answers) {
    return (
      <div className="mx-auto flex min-h-screen max-w-[560px] flex-col justify-center px-5">
        <h1 className="display text-[1.6rem] text-ink">No audit attached</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">
          Open this view from the pilot dashboard&apos;s session list, or pass a
          report with <code className="tnum">?a=</code>. With a session id it
          needs the pilot store to be configured.
        </p>
        <Link
          href="/internal/pilot"
          className="mt-6 inline-flex min-h-11 items-center text-[14px] font-semibold text-accent no-underline"
        >
          Pilot dashboard
        </Link>
      </div>
    );
  }

  const result = runAudit(answers);
  const brief = buildBrief(result);
  const outcome = sessionId ? await store.getOutcome(sessionId) : null;
  const briefHref = `/internal/brief?a=${encodeURIComponent(encoded)}${sessionId ? `&s=${sessionId}` : ""}`;

  const standDown =
    result.verdict.level === "healthy" ||
    result.verdict.level === "insufficient_data";

  // The five questions worth asking, not the whole discovery script.
  const questions = [brief.openingQuestion, ...brief.discoveryQuestions].slice(0, 5);

  return (
    <div className="mx-auto max-w-[640px] px-5 py-6 pb-16 sm:py-10">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule pb-4">
        <div>
          <p className="eyebrow">Discovery call</p>
          <h1 className="display mt-1 text-[1.5rem] leading-tight text-ink">
            {brief.sizeBand}
          </h1>
        </div>
        {sessionId ? (
          <span className="tnum text-[12px] text-ink-faint">
            {sessionId.slice(3, 11)}
          </span>
        ) : null}
      </header>

      <Block eyebrow="Practice">
        <p className="tnum text-[15px] leading-relaxed text-ink">
          {brief.practiceProfile}
        </p>
        <p className="tnum mt-1.5 text-[13.5px] text-ink-muted">
          Collections: {brief.estimatedAnnualCollections}
        </p>
      </Block>

      <Block eyebrow="Trust level">
        <p className="tnum text-[14px] leading-relaxed text-ink">
          {brief.coverageSummary}
        </p>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-muted">
          {brief.confidenceCaution}
        </p>
      </Block>

      <Block eyebrow="Verdict" tone={standDown ? "caution" : "default"}>
        <p className="text-[16px] font-semibold leading-snug text-ink">
          {brief.verdict}
        </p>
        {standDown ? (
          <p className="mt-2 text-[14px] leading-relaxed text-ink">
            Stand down. {brief.recommendedConversation}
          </p>
        ) : null}
      </Block>

      {!standDown ? (
        <>
          <Block eyebrow="Predicted pain">
            <p className="text-[16px] font-semibold leading-snug text-ink">
              {brief.primaryPain}
            </p>
            <ul className="mt-3 space-y-2">
              {brief.primaryPainEvidence.slice(0, 2).map((e) => (
                <li key={e.label} className="tnum text-[14px] leading-relaxed text-ink-muted">
                  <span className="font-medium text-ink">{e.label}:</span> {e.value}
                  {e.observed ? "" : " (derived)"}
                </li>
              ))}
            </ul>
          </Block>

          <Block eyebrow="The money — quote the finding, never this figure">
            <p className="tnum text-[15px] font-semibold text-ink">
              {brief.recurringRange}
            </p>
            {brief.oneTimeRange ? (
              <p className="tnum mt-1 text-[13.5px] text-ink-muted">
                Plus {brief.oneTimeRange}
              </p>
            ) : null}
            <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
              Diagnostic estimate from their own inputs, not promised savings.
              Let them own the number.
            </p>
          </Block>
        </>
      ) : null}

      {brief.sensitivity.length > 0 ? (
        <Block eyebrow="Assumptions that move the number most">
          <ul className="space-y-2.5">
            {brief.sensitivity.slice(0, 3).map((item) => (
              <li key={item.assumption} className="text-[13.5px] leading-relaxed text-ink-muted">
                <span className="font-medium text-ink">
                  {item.assumption} ({item.currentValue}):
                </span>{" "}
                {item.effect}
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      <Block eyebrow="Five questions">
        <ol className="list-decimal space-y-2.5 pl-5">
          {questions.map((q) => (
            <li key={q} className="text-[14.5px] leading-relaxed text-ink">
              {q}
            </li>
          ))}
        </ol>
      </Block>

      <Block eyebrow="What would prove us wrong">
        <ul className="list-disc space-y-2 pl-5">
          {brief.invalidators.slice(0, 3).map((inv) => (
            <li key={inv} className="text-[13.5px] leading-relaxed text-ink-muted">
              {inv}
            </li>
          ))}
        </ul>
      </Block>

      <Block eyebrow="Do not pitch" tone="caution">
        <ul className="space-y-2">
          {brief.doNotPitch.slice(0, 2).map((d) => (
            <li key={d} className="text-[13.5px] leading-relaxed text-ink">
              {d}
            </li>
          ))}
        </ul>
      </Block>

      <div className="mt-8 space-y-3">
        <Link
          href={`${briefHref}#outcome`}
          prefetch={false}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-accent px-6 text-center text-[15px] font-semibold text-white no-underline transition-colors hover:bg-accent-ink"
        >
          {outcome && outcome.callOutcome !== "no_call_yet"
            ? "Edit the recorded outcome"
            : "Record the outcome"}
        </Link>
        <p className="text-center text-[12.5px] leading-relaxed text-ink-faint">
          {outcome && outcome.callOutcome !== "no_call_yet"
            ? "An outcome is already recorded for this session."
            : "Do it right after hanging up — details do not survive the day."}
        </p>
        <div className="flex justify-center gap-6 pt-1">
          <Link
            href={briefHref}
            prefetch={false}
            className="inline-flex min-h-11 items-center text-[13.5px] font-medium text-ink-muted no-underline hover:text-ink"
          >
            Full brief
          </Link>
          <Link
            href="/internal/pilot"
            prefetch={false}
            className="inline-flex min-h-11 items-center text-[13.5px] font-medium text-ink-muted no-underline hover:text-ink"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
