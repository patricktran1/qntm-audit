"use client";

import { useEffect, useState } from "react";
import { captureEntry, resetPilotIdentity } from "@/lib/pilot/attribution";

/**
 * CONFERENCE MODE
 *
 * Marks this browser as demo traffic so nothing shown at a booth is counted as
 * evidence about a real practice, and gives the operator a one-tap reset so a
 * handed-over phone starts clean for the next person.
 *
 * Deliberately not styled as an admin control: it is one quiet line, because
 * the person being shown the product is standing next to you.
 */
export function DemoControls({ source }: { source: string }) {
  const [reset, setReset] = useState(false);

  useEffect(() => {
    // Entry mode "demo" is sticky, so every audit started from here is flagged
    // and excluded from verdict-distribution learning.
    const params = new URLSearchParams(window.location.search);
    if (!params.get("source")) params.set("source", source);
    captureEntry(params, "demo");
  }, [source]);

  return (
    <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-rule pt-5">
      <button
        type="button"
        onClick={() => {
          resetPilotIdentity();
          // Re-mark as demo immediately so the booth device never silently
          // becomes "real" traffic after a reset.
          captureEntry(new URLSearchParams({ source }), "demo");
          setReset(true);
          window.setTimeout(() => setReset(false), 2000);
        }}
        className="inline-flex min-h-11 items-center rounded-md border border-rule-strong px-3.5 text-[13px] font-medium text-ink-muted transition-colors hover:border-ink-faint hover:text-ink"
      >
        {reset ? "Reset" : "Reset this device"}
      </button>
      <p className="text-[12.5px] leading-relaxed text-ink-faint">
        Clears the session on this browser so the next person starts fresh.
        Anything run from here is recorded as a demonstration and excluded from
        pilot learning.
      </p>
    </div>
  );
}
