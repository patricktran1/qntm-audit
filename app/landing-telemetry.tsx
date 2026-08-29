"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";

/** Fires once on mount. Isolated so the landing page stays a server component. */
export function LandingTelemetry() {
  useEffect(() => {
    track({ name: "landing_viewed" });
  }, []);
  return null;
}
