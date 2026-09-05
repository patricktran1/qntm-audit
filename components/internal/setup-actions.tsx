"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  isTestDevice,
  markTestDevice,
  unmarkTestDevice,
} from "@/lib/pilot/attribution";

/**
 * The three operator actions on /internal/setup. Each one reports exactly
 * what happened; none of them pretends success it cannot verify.
 */

const buttonClass =
  "inline-flex min-h-11 items-center rounded-md border border-rule-strong px-3.5 text-[13px] font-medium text-ink-muted transition-colors hover:border-ink-faint hover:text-ink disabled:opacity-50";

export function TestLeadButton() {
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const send = async () => {
    setState("sending");
    setMessage(null);
    try {
      const res = await fetch("/internal/api/test-lead", { method: "POST" });
      const body = (await res.json()) as {
        ok: boolean;
        configured?: string[];
        sinks?: string[];
        failures?: string[];
        error?: string;
      };
      if (body.ok) {
        setMessage(
          `Delivered to ${body.sinks?.join(", ")}. Check the channel for a message headlined [TEST].`,
        );
      } else if (body.error) {
        setMessage(body.error);
      } else {
        setMessage(
          `Failed: delivered to [${body.sinks?.join(", ") || "none"}], failed for [${body.failures?.join(", ") || "unknown"}].`,
        );
      }
    } catch {
      setMessage("Request failed. Are you still authenticated?");
    }
    setState("done");
  };

  return (
    <div>
      <button type="button" onClick={send} disabled={state === "sending"} className={buttonClass}>
        {state === "sending" ? "Sending…" : "Send test lead notification"}
      </button>
      {message ? (
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-muted">{message}</p>
      ) : null}
    </div>
  );
}

export function ClearTestButton({ testCount }: { testCount: number }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "working" | "done">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const clear = async () => {
    // Scoped by construction to isTest records, but still destructive —
    // confirm with the actual count so the operator knows what goes.
    const confirmed = window.confirm(
      `Delete ${testCount} test session${testCount === 1 ? "" : "s"} and any outcomes recorded against them? Real pilot records are not touched. A demo session recorded on a test device counts as test and is included.`,
    );
    if (!confirmed) return;
    setState("working");
    try {
      const res = await fetch("/internal/api/clear-test", { method: "POST" });
      const body = (await res.json()) as { ok: boolean; deleted: number; error?: string };
      setMessage(
        body.ok
          ? `Deleted ${body.deleted} test record${body.deleted === 1 ? "" : "s"}.`
          : `Failed: ${body.error ?? "unknown"}.`,
      );
      if (body.ok) router.refresh();
    } catch {
      setMessage("Request failed. Are you still authenticated?");
    }
    setState("done");
  };

  return (
    <div>
      <button
        type="button"
        onClick={clear}
        disabled={state === "working" || testCount === 0}
        className={buttonClass}
      >
        {state === "working"
          ? "Clearing…"
          : `Clear test records (${testCount})`}
      </button>
      {message ? (
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-muted">{message}</p>
      ) : null}
    </div>
  );
}

export function TestDeviceToggle() {
  const [marked, setMarked] = useState<boolean | null>(null);

  useEffect(() => {
    setMarked(isTestDevice());
  }, []);

  if (marked === null) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (marked) unmarkTestDevice();
          else markTestDevice();
          setMarked(!marked);
        }}
        className={buttonClass}
      >
        {marked ? "Unmark this browser as a test device" : "Mark this browser as a test device"}
      </button>
      <p className="mt-2 text-[12.5px] leading-relaxed text-ink-muted">
        {marked
          ? "This browser is a test device. Every audit it completes is flagged isTest, excluded from learning, and removable with one click above."
          : "Not marked. An audit completed from this browser would count as real pilot data — mark it before walking through the product yourself."}
      </p>
    </div>
  );
}
