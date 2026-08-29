"use client";

import { useCallback, useState } from "react";
import { track } from "@/lib/analytics";
import { textSummary } from "@/lib/summary";
import type { AuditResult } from "@/lib/engine/types";

type Action = "summary" | "link" | null;

/**
 * SHARE
 *
 * Reports travel between a physician, a practice manager, and a partner, so
 * every action here has to work without an account. The share link carries the
 * answers and nothing else — no contact details, no lead state, no identity.
 *
 * Web Share is used where the platform offers it (which is where it is
 * genuinely better), with clipboard as the universal fallback.
 */
export function ShareActions({
  result,
  shareUrl,
  compact = false,
}: {
  result: AuditResult;
  shareUrl: string;
  compact?: boolean;
}) {
  const [done, setDone] = useState<Action>(null);

  const flash = (a: Action) => {
    setDone(a);
    window.setTimeout(() => setDone(null), 2200);
  };

  const writeClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Clipboard blocked (insecure context, permission). Give the user
      // something they can still copy by hand rather than failing silently.
      window.prompt("Copy this:", text);
      return false;
    }
  }, []);

  const shareLink = useCallback(async () => {
    const canWebShare =
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function" &&
      // Desktop Chrome advertises share but opens a poor dialog; restrict to
      // touch devices where the sheet is the better experience.
      typeof window !== "undefined" &&
      window.matchMedia("(pointer: coarse)").matches;

    if (canWebShare) {
      try {
        await navigator.share({
          title: "QNTM Practice Audit",
          text: "The operational read on our practice.",
          url: shareUrl,
        });
        track({ name: "report_shared", method: "web_share" });
        return;
      } catch {
        // User dismissed the sheet, or the platform refused. Fall through.
      }
    }
    await writeClipboard(shareUrl);
    track({ name: "report_shared", method: "clipboard" });
    flash("link");
  }, [shareUrl, writeClipboard]);

  const copySummary = useCallback(async () => {
    await writeClipboard(textSummary(result, shareUrl));
    track({ name: "summary_copied" });
    flash("summary");
  }, [result, shareUrl, writeClipboard]);

  const print = useCallback(() => {
    track({ name: "report_printed" });
    window.print();
  }, []);

  const base =
    "inline-flex min-h-11 items-center justify-center rounded-md border border-rule-strong px-3 text-[13px] font-medium text-ink-muted transition-colors hover:border-ink-faint hover:text-ink sm:px-3.5";

  return (
    <div className="no-print flex items-center gap-2">
      <button type="button" onClick={copySummary} className={base}>
        {done === "summary" ? "Copied" : "Copy"}
        {compact ? null : <span className="hidden sm:inline">&nbsp;summary</span>}
      </button>
      <button type="button" onClick={shareLink} className={base}>
        {done === "link" ? "Copied" : "Share"}
        {compact ? null : <span className="hidden sm:inline">&nbsp;link</span>}
      </button>
      <button
        type="button"
        onClick={print}
        className="inline-flex min-h-11 items-center justify-center rounded-md bg-ink px-3 text-[13px] font-semibold text-paper transition-colors hover:bg-accent-ink sm:px-3.5"
      >
        <span className="hidden sm:inline">Download&nbsp;</span>PDF
      </button>
    </div>
  );
}
