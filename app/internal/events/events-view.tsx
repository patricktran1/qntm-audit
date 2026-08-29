"use client";

import { useEffect, useState } from "react";
import { Wordmark } from "@/components/wordmark";
import { clearQueue, readQueue, type TrackedEvent } from "@/lib/analytics";

export function EventsView() {
  const [events, setEvents] = useState<TrackedEvent[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setEvents(readQueue());
    setLoaded(true);
  }, []);

  const funnel = [
    "landing_viewed",
    "audit_started",
    "audit_completed",
    "report_viewed",
    "cta_clicked",
    "lead_form_viewed",
    "lead_submitted",
  ];
  const counts = new Map<string, number>();
  for (const e of events)
    counts.set(e.event.name, (counts.get(e.event.name) ?? 0) + 1);

  return (
    <div className="mx-auto max-w-[900px] px-5 py-10 sm:px-8 sm:py-14">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Wordmark subdued />
        <span className="rounded border border-signal-weak/40 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-signal-weak">
          Internal
        </span>
      </header>

      <h1 className="display mt-10 text-[2rem] leading-tight text-ink">
        Session events
      </h1>
      <p className="mt-3 max-w-2xl text-[14.5px] leading-relaxed text-ink-muted">
        Everything this browser session has emitted, in order. Events carry
        banded dimensions only — no collections figures, no contact details, no
        free text. This is a verification tool, not an analytics product.
      </p>

      <section className="mt-9">
        <p className="eyebrow">Funnel, this session</p>
        <ol className="mt-3 grid gap-px overflow-hidden rounded-lg border border-rule bg-rule sm:grid-cols-4">
          {funnel.map((name) => (
            <li key={name} className="bg-paper-raised px-4 py-3">
              <p className="tnum display text-[1.4rem] leading-none text-ink">
                {counts.get(name) ?? 0}
              </p>
              <p className="mt-1.5 text-[11px] uppercase tracking-[0.08em] text-ink-faint">
                {name.replace(/_/g, " ")}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <p className="eyebrow">Event log ({events.length})</p>
          {events.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                clearQueue();
                setEvents([]);
              }}
              className="min-h-11 text-[12.5px] font-medium text-accent underline decoration-rule-strong underline-offset-4"
            >
              Clear
            </button>
          ) : null}
        </div>

        {loaded && events.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-rule-strong px-5 py-8 text-center text-[14px] text-ink-muted">
            Nothing yet in this session. Run an audit in this browser and come
            back.
          </p>
        ) : (
          <ol className="mt-4 space-y-2">
            {[...events].reverse().map((e, i) => (
              <li
                key={`${e.ts}-${i}`}
                className="rounded-md border border-rule bg-paper-raised px-4 py-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="text-[13.5px] font-semibold text-ink">
                    {e.event.name}
                  </span>
                  <span className="tnum text-[11.5px] text-ink-faint">
                    {new Date(e.ts).toLocaleTimeString()}
                    {e.variant ? ` · variant ${e.variant}` : ""}
                  </span>
                </div>
                <pre className="tnum mt-1.5 overflow-x-auto whitespace-pre-wrap break-words text-[11.5px] leading-relaxed text-ink-muted">
                  {JSON.stringify(
                    Object.fromEntries(
                      Object.entries(e.event).filter(([k]) => k !== "name"),
                    ),
                  )}
                </pre>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
