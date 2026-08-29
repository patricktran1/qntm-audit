"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/wordmark";
import { track } from "@/lib/analytics";
import { runAudit } from "@/lib/engine/audit";
import { decodeAnswers } from "@/lib/share";
import { num } from "@/lib/format";
import { LEAD_ROLES, NEXT_STEPS } from "@/lib/leads/types";
import { leadIdentity } from "@/lib/pilot/client";

/**
 * LEAD CAPTURE
 *
 * Reached only from a completed report, and never blocking it. Every field the
 * audit already knows is stated back rather than asked for again — asking a
 * physician to re-enter their physician count after seventeen questions is how
 * a diagnostic starts feeling like a lead-gen quiz.
 */
export function TalkForm({ report }: { report?: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const viewed = useRef(false);

  const context = useMemo(() => {
    const answers = report ? decodeAnswers(report) : null;
    if (!answers) return null;
    const result = runAudit(answers);
    return {
      answers,
      result,
      topCategory: result.topOpportunities[0]?.category ?? null,
      posture: result.offer.posture,
    };
  }, [report]);

  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    track({
      name: "lead_form_viewed",
      posture: context?.posture ?? "soft",
      topCategory: context?.topCategory ?? null,
    });
  }, [context]);

  const backHref = report ? `/results?a=${encodeURIComponent(report)}` : "/";

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          practiceName: data.get("practiceName"),
          role: data.get("role"),
          location: data.get("location"),
          website: data.get("website"),
          concern: data.get("concern"),
          nextStep: data.get("nextStep"),
          consent: data.get("consent") === "on",
          report: report ?? "",
          ...leadIdentity(),
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Something went wrong. Please try again.");
        setState("error");
        return;
      }
      track({
        name: "lead_submitted",
        posture: context?.posture ?? "soft",
        topCategory: context?.topCategory ?? null,
        nextStep: String(data.get("nextStep") ?? "call"),
      });
      setState("sent");
    } catch {
      setError("We could not reach the server. Please try again in a moment.");
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <div className="mx-auto flex min-h-screen max-w-[620px] flex-col justify-center px-5 py-16 sm:px-8">
        <Wordmark />
        <h1 className="display mt-10 text-[2rem] leading-tight text-ink">
          That came through
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-muted">
          We will read your report before we reply, so the first conversation
          starts from your numbers rather than from a script. Your report link
          still works and is unchanged — nothing you just sent us appears in it.
        </p>
        <Link
          href={backHref}
          className="mt-8 inline-flex min-h-12 w-fit items-center justify-center rounded-md border border-rule-strong px-6 py-3 text-[15px] font-semibold text-ink no-underline transition-colors hover:border-ink-faint"
        >
          Back to my report
        </Link>
      </div>
    );
  }

  const offer = context?.result.offer;

  return (
    <div className="mx-auto max-w-[640px] px-5 py-12 sm:px-8 sm:py-16">
      <Wordmark />

      <h1 className="display mt-10 text-[2rem] leading-tight text-ink">
        {offer?.posture === "none"
          ? "Send me the report link"
          : offer?.posture === "soft"
            ? "Pressure-test this analysis"
            : "Review these findings with us"}
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-ink-muted">
        {offer?.posture === "none"
          ? "We said we do not think you need us, and we meant it. Leave an address and we will send the link so you can re-run this in six months — nothing else."
          : "We are asking for your email so we can reply. Your results were already yours before you got here, and this page changes nothing about that."}
      </p>

      {/* What the audit already knows. Stated, never re-asked. */}
      {context ? (
        <div className="mt-8 rounded-lg border border-rule bg-paper-sunk px-5 py-4">
          <p className="eyebrow">Attached to this request</p>
          <ul className="mt-2.5 space-y-1 text-[13px] leading-relaxed text-ink-muted">
            <li>
              Your full report, including{" "}
              {context.answers.physicians !== null
                ? `${num(context.answers.physicians, 1)} physician${
                    context.answers.physicians === 1 ? "" : "s"
                  }`
                : "your practice details"}
              {context.result.score.overall !== null
                ? ` and a Practice Leverage Score of ${context.result.score.overall}`
                : ""}
              .
            </li>
            {context.result.topOpportunities[0] ? (
              <li>
                The leading finding:{" "}
                {context.result.topOpportunities[0].title.toLowerCase()}.
              </li>
            ) : null}
          </ul>
          <p className="mt-3 border-t border-rule pt-2.5 text-[12px] leading-relaxed text-ink-faint">
            We do not ask for any of this again below.
          </p>
        </div>
      ) : null}

      <form onSubmit={submit} className="mt-9 space-y-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <Field name="name" label="Name" autoComplete="name" />
          <Field
            name="email"
            label="Email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
          />
          <Field
            name="practiceName"
            label="Practice"
            autoComplete="organization"
          />
          <Field
            name="location"
            label="City / state"
            autoComplete="address-level2"
          />
        </div>

        <Field
          name="website"
          label="Practice website"
          type="text"
          autoComplete="url"
          inputMode="url"
          placeholder="example.com"
        />

        <div>
          <label htmlFor="role" className="text-[14px] font-semibold text-ink">
            Your role
          </label>
          <select
            id="role"
            name="role"
            defaultValue="owner_physician"
            className="mt-2 min-h-12 w-full rounded-md border border-rule-strong bg-paper-raised px-3.5 py-3 text-[16px] text-ink outline-none transition-colors focus:border-accent"
          >
            {LEAD_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <fieldset>
          <legend className="text-[14px] font-semibold text-ink">
            What would be most useful?
          </legend>
          <div className="mt-3 space-y-2">
            {NEXT_STEPS.map((n, i) => (
              <label
                key={n.value}
                className="flex min-h-12 cursor-pointer items-start gap-3 rounded-md border border-rule-strong bg-paper-raised px-4 py-3 transition-colors has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
              >
                <input
                  type="radio"
                  name="nextStep"
                  value={n.value}
                  defaultChecked={
                    offer?.posture === "none" ? n.value === "not_yet" : i === 0
                  }
                  className="mt-1 accent-accent"
                />
                <span>
                  <span className="block text-[14.5px] font-medium text-ink">
                    {n.label}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-muted">
                    {n.help}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="concern" className="text-[14px] font-semibold text-ink">
            What is actually on your mind?
            <span className="ml-1.5 font-normal text-ink-faint">optional</span>
          </label>
          <textarea
            id="concern"
            name="concern"
            rows={4}
            placeholder="The findings you disagree with are the most useful thing you can tell us — they are where the conversation should start."
            className="mt-2 w-full rounded-md border border-rule-strong bg-paper-raised px-3.5 py-3 text-[16px] leading-relaxed text-ink outline-none transition-colors placeholder:text-ink-faint/70 focus:border-accent"
          />
        </div>

        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            name="consent"
            defaultChecked
            className="mt-1 accent-accent"
          />
          <span className="text-[13px] leading-relaxed text-ink-muted">
            QNTM may contact me about this report. We do not add anyone to a
            mailing list from this form, and one reply asking us to stop ends it.
          </span>
        </label>

        {error ? (
          <p role="alert" className="text-[13.5px] text-signal-weak">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-5 pt-1">
          <button
            type="submit"
            disabled={state === "sending"}
            className="inline-flex min-h-12 items-center justify-center rounded-md bg-accent px-7 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-accent-ink disabled:bg-rule-strong"
          >
            {state === "sending" ? "Sending…" : "Send"}
          </button>
          <Link
            href={backHref}
            className="inline-flex min-h-11 items-center text-[14px] font-medium text-ink-muted no-underline hover:text-ink"
          >
            Back to my report
          </Link>
        </div>

        <p className="border-t border-rule pt-5 text-[12px] leading-relaxed text-ink-faint">
          We use this to reply to you and nothing else. Your report link is
          included so we can read it before we call. No practice data is stored
          on our side unless you send it here.
        </p>
      </form>
    </div>
  );
}

function Field({
  name,
  label,
  type = "text",
  required = false,
  autoComplete,
  inputMode,
  placeholder,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  inputMode?: "email" | "url" | "text";
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="text-[14px] font-semibold text-ink">
        {label}
        {!required ? (
          <span className="ml-1.5 font-normal text-ink-faint">optional</span>
        ) : null}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        inputMode={inputMode}
        placeholder={placeholder}
        className="mt-2 min-h-12 w-full rounded-md border border-rule-strong bg-paper-raised px-3.5 py-3 text-[16px] text-ink outline-none transition-colors placeholder:text-ink-faint/70 focus:border-accent"
      />
    </div>
  );
}
