"use client";

import { useState } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/wordmark";
import { track } from "@/lib/analytics";

export function TalkForm({ report }: { report?: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const backHref = report ? `/results?a=${encodeURIComponent(report)}` : "/results";

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
          email: data.get("email"),
          name: data.get("name"),
          practice: data.get("practice"),
          note: data.get("note"),
          report,
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Something went wrong. Please try again.");
        setState("error");
        return;
      }
      track({ name: "consultation_requested", hasEmail: true });
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
          Thank you — that came through
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-muted">
          We will read your report before we reply, so the first conversation
          starts from your numbers rather than from a script. Your report link
          still works and is unchanged.
        </p>
        <Link
          href={backHref}
          className="mt-8 inline-flex w-fit items-center justify-center rounded-md border border-rule-strong px-6 py-3 text-[15px] font-semibold text-ink no-underline transition-colors hover:border-ink-faint"
        >
          Back to my report
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[620px] px-5 py-12 sm:px-8 sm:py-16">
      <Wordmark />
      <h1 className="display mt-10 text-[2rem] leading-tight text-ink">
        Request a review
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-ink-muted">
        Thirty minutes, going through your report together. We are asking for
        your email only so we can reply — your results were already yours before
        you got here, and this page changes nothing about that.
      </p>

      <form onSubmit={submit} className="mt-10 space-y-6">
        {[
          { name: "name", label: "Name", type: "text", required: false, autoComplete: "name" },
          {
            name: "email",
            label: "Email",
            type: "email",
            required: true,
            autoComplete: "email",
          },
          {
            name: "practice",
            label: "Practice",
            type: "text",
            required: false,
            autoComplete: "organization",
          },
        ].map((f) => (
          <div key={f.name}>
            <label
              htmlFor={f.name}
              className="text-[14px] font-semibold text-ink"
            >
              {f.label}
              {!f.required ? (
                <span className="ml-1.5 font-normal text-ink-faint">
                  optional
                </span>
              ) : null}
            </label>
            <input
              id={f.name}
              name={f.name}
              type={f.type}
              required={f.required}
              autoComplete={f.autoComplete}
              className="mt-2 w-full rounded-md border border-rule-strong bg-paper-raised px-3.5 py-3 text-[16px] text-ink outline-none transition-colors focus:border-accent"
            />
          </div>
        ))}

        <div>
          <label htmlFor="note" className="text-[14px] font-semibold text-ink">
            Anything the report got wrong?
            <span className="ml-1.5 font-normal text-ink-faint">optional</span>
          </label>
          <textarea
            id="note"
            name="note"
            rows={4}
            placeholder="Genuinely useful to us — the findings you disagree with are the ones worth discussing first."
            className="mt-2 w-full rounded-md border border-rule-strong bg-paper-raised px-3.5 py-3 text-[15px] leading-relaxed text-ink outline-none transition-colors placeholder:text-ink-faint/70 focus:border-accent"
          />
        </div>

        {error ? (
          <p role="alert" className="text-[13.5px] text-signal-weak">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-5 pt-2">
          <button
            type="submit"
            disabled={state === "sending"}
            className="inline-flex items-center justify-center rounded-md bg-accent px-7 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-accent-ink disabled:bg-rule-strong"
          >
            {state === "sending" ? "Sending…" : "Request review"}
          </button>
          <Link
            href={backHref}
            className="text-[14px] font-medium text-ink-muted no-underline hover:text-ink"
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
