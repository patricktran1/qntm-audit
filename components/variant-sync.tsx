"use client";

import { useEffect } from "react";
import { rememberVariant, track, type Variant } from "@/lib/analytics";
import { captureEntry, type EntryMode } from "@/lib/pilot/attribution";

/**
 * Mirrors the server-assigned variant into localStorage so every later event
 * carries it, captures campaign attribution on first touch, and records the
 * landing view. Isolated so the page can stay a server component.
 */
export function LandingTelemetry({
  variant,
  entryMode = "direct",
}: {
  variant: Variant;
  entryMode?: EntryMode;
}) {
  useEffect(() => {
    rememberVariant(variant);
    captureEntry(new URLSearchParams(window.location.search), entryMode);
    track({ name: "landing_viewed", variant });
  }, [variant, entryMode]);
  return null;
}
