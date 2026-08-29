"use client";

import { useEffect } from "react";
import { rememberVariant, track, type Variant } from "@/lib/analytics";

/**
 * Mirrors the server-assigned variant into localStorage so every later event
 * carries it, then records the landing view. Isolated so the landing page can
 * stay a server component.
 */
export function LandingTelemetry({ variant }: { variant: Variant }) {
  useEffect(() => {
    rememberVariant(variant);
    track({ name: "landing_viewed", variant });
  }, [variant]);
  return null;
}
