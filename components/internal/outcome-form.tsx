"use client";

import { useState } from "react";
import { EDITABLE_ASSUMPTIONS } from "@/lib/engine/assumptions";
import {
  AUDIT_ACCURACIES,
  CALL_OUTCOMES,
  ECONOMIC_REACTIONS,
  NEXT_ACTIONS,
  PAIN_CATEGORIES,
  SERVICES,
  type DiscoveryOutcome,
} from "@/lib/pilot/types";

/**
 * DISCOVERY OUTCOME CAPTURE
 *
 * The point of the whole pilot. The audit predicts a practice's primary pain;
 * this is where an operator records what the conversation actually said.
 *
 * Everything is a controlled value except two bounded notes, so the data stays
 * inspectable and aggregatable. Deliberately no LLM anywhere near it: a summary
 * of a summary is not evidence.
 */
export function OutcomeForm({
  sessionId,
  predictedCategory,
  predictedFinding,
  existing,
  storeConfigured,
}: {
  sessionId: string;
  predictedCategory: string | null;
  predictedFinding: string | null;
  existing: DiscoveryOutcome | null;
  storeConfigured: boolean;
}) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setState("saving");
    setError(null);
    try {
      const res = await fetch("/internal/api/outcome", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          callOutcome: data.get("callOutcome"),
          auditAccuracy: data.get("auditAccuracy"),
          actualPain: data.get("actualPain"),
          economicReaction: data.get("economicReaction"),
          mostChallengedAssumption: data.get("mostChallengedAssumption"),
          whyBuy: data.get("whyBuy"),
          whyNotBuy: data.get("whyNotBuy"),
          serviceRelevant: data.get("serviceRelevant"),
          nextAction: data.get("nextAction"),
          nextActionNote: data.get("nextActionNote"),
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Could not save.");
        setState("error");
        return;
      }
      setState("saved");
    } catch {
      setError("Could not reach the server.");
      setState("error");
    }
  }

  if (!sessionId) {
    return (
      <div className="rounded-lg border border-dashed border-rule-strong px-5 py-6 text-[13.5px] leading-relaxed text-ink-muted">
        This brief was opened without a session id, so an outcome cannot be
        attached to it. Open the brief from the pilot dashboard or from a lead
        notification to record what the call concluded.
      </div>
    );
  }

  return (
    <form
      id="outcome"
      onSubmit={submit}
      className="rounded-lg border border-accent/30 bg-accent-soft/30 p-6 scroll-mt-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-accent-ink">
          After the call
        </p>
        <span className="tnum text-[12px] text-ink-faint">
          session {sessionId.slice(3, 11)}
        </span>
      </div>
      <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-ink-muted">
        We predicted{" "}
        <span className="font-semibold text-ink">
          {predictedFinding ?? "no dominant finding"}
        </span>
        {predictedCategory ? ` (${predictedCategory})` : ""}. Record what actually
        happened — especially if we were wrong. Disagreement is the most
        valuable data this pilot can collect.
      </p>

      {!storeConfigured ? (
        <p className="mt-4 rounded-md border border-signal-mid/40 bg-signal-mid/10 px-4 py-3 text-[13px] leading-relaxed text-ink">
          No pilot store is configured, so this form cannot save. Set{" "}
          <code className="tnum">PILOT_KV_REST_URL</code> and{" "}
          <code className="tnum">PILOT_KV_REST_TOKEN</code> first.
        </p>
      ) : null}

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <Select
          name="callOutcome"
          label="Call outcome"
          options={CALL_OUTCOMES}
          defaultValue={existing?.callOutcome ?? "spoke"}
        />
        <Select
          name="auditAccuracy"
          label="Was our primary finding right?"
          options={AUDIT_ACCURACIES}
          defaultValue={existing?.auditAccuracy ?? "unable_to_determine"}
          help={
            AUDIT_ACCURACIES.map((a) => `${a.label}: ${a.help}`).join(" · ")
          }
        />
        <Select
          name="actualPain"
          label="Real primary pain"
          options={PAIN_CATEGORIES.map((p) => ({ value: p, label: p }))}
          defaultValue={existing?.actualPain ?? predictedCategory ?? "other"}
        />
        <Select
          name="economicReaction"
          label="Reaction to the economic estimate"
          options={ECONOMIC_REACTIONS}
          defaultValue={existing?.economicReaction ?? "not_discussed"}
        />
        <Select
          name="mostChallengedAssumption"
          label="Most challenged assumption"
          options={[
            { value: "", label: "None / not discussed" },
            ...EDITABLE_ASSUMPTIONS.map((a) => ({
              value: a.key as string,
              label: a.label,
            })),
          ]}
          defaultValue={existing?.mostChallengedAssumption ?? ""}
        />
        <Select
          name="serviceRelevant"
          label="Service actually relevant"
          options={SERVICES.map((s) => ({ value: s, label: s }))}
          defaultValue={existing?.serviceRelevant ?? "none"}
        />
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Note
          name="whyBuy"
          label="Why they would buy"
          defaultValue={existing?.whyBuy ?? ""}
          placeholder="In their words where possible."
        />
        <Note
          name="whyNotBuy"
          label="Why they would not"
          defaultValue={existing?.whyNotBuy ?? ""}
          placeholder="The objection that actually mattered."
        />
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Select
          name="nextAction"
          label="Next action"
          options={NEXT_ACTIONS}
          defaultValue={existing?.nextAction ?? "none"}
        />
        <Note
          name="nextActionNote"
          label="Next action note"
          defaultValue={existing?.nextActionNote ?? ""}
          placeholder="Date, owner, what specifically."
          rows={2}
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-accent/20 pt-5">
        <button
          type="submit"
          disabled={state === "saving" || !storeConfigured}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-6 text-[14px] font-semibold text-white transition-colors hover:bg-accent-ink disabled:bg-rule-strong"
        >
          {state === "saving"
            ? "Saving…"
            : existing
              ? "Update outcome"
              : "Record outcome"}
        </button>
        {state === "saved" ? (
          <span className="text-[13.5px] text-signal-strong">Saved.</span>
        ) : null}
        {error ? (
          <span role="alert" className="text-[13.5px] text-signal-weak">
            {error}
          </span>
        ) : null}
        {existing ? (
          <span className="text-[12.5px] text-ink-faint">
            Last recorded {new Date(existing.recordedAt).toLocaleString()} against
            model {existing.modelVersion}
          </span>
        ) : null}
      </div>
    </form>
  );
}

function Select({
  name,
  label,
  options,
  defaultValue,
  help,
}: {
  name: string;
  label: string;
  options: readonly { value: string; label: string }[];
  defaultValue: string;
  help?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="text-[13.5px] font-semibold text-ink">
        {label}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue}
        className="mt-1.5 min-h-11 w-full rounded-md border border-rule-strong bg-paper-raised px-3 py-2 text-[14px] text-ink outline-none focus:border-accent"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {help ? (
        <p className="mt-1 text-[11.5px] leading-relaxed text-ink-faint">{help}</p>
      ) : null}
    </div>
  );
}

function Note({
  name,
  label,
  defaultValue,
  placeholder,
  rows = 3,
}: {
  name: string;
  label: string;
  defaultValue: string;
  placeholder: string;
  rows?: number;
}) {
  return (
    <div>
      <label htmlFor={name} className="text-[13.5px] font-semibold text-ink">
        {label}
      </label>
      <textarea
        id={name}
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        placeholder={placeholder}
        maxLength={600}
        className="mt-1.5 w-full rounded-md border border-rule-strong bg-paper-raised px-3 py-2 text-[14px] leading-relaxed text-ink outline-none placeholder:text-ink-faint/70 focus:border-accent"
      />
    </div>
  );
}
