"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";

export function BriefTelemetry() {
  useEffect(() => {
    track({ name: "brief_viewed" });
  }, []);
  return null;
}
