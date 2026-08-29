"use client";

import { useMemo, useState } from "react";
import {
  ATTRIBUTION_KEYS,
  formatAttribution,
  sanitizeAttributionValue,
  type Attribution,
  type AttributionKey,
} from "@/lib/pilot/attribution";

/**
 * OUTREACH LINK GENERATOR
 *
 * Not a campaign manager: it builds one URL at a time, through exactly the
 * sanitisation production applies, and shows what first-touch attribution
 * will record. Sending the link is done by hand, outside the product.
 */

const FIELD_HELP: Record<AttributionKey, { label: string; help: string; placeholder: string }> = {
  source: {
    label: "Source",
    help: "Where the person is coming from.",
    placeholder: "leaderm, personal, referral",
  },
  campaign: {
    label: "Campaign",
    help: "The outreach effort this link belongs to.",
    placeholder: "2026_followup, founder_pilot",
  },
  cohort: {
    label: "Cohort",
    help: "The analysis group. Use first10 for the initial pilot cohort.",
    placeholder: "first10, wave1",
  },
  ref: {
    label: "Ref (optional)",
    help: "A per-person tag if you want to tell recipients apart. Never a name — an initial-plus-number like d3 keeps the link anonymous.",
    placeholder: "d3",
  },
};

const PRESETS: { name: string; values: Attribution }[] = [
  {
    name: "First-ten pilot",
    values: { source: "personal", campaign: "founder_pilot", cohort: "first10" },
  },
  {
    name: "LEADERM follow-up",
    values: { source: "leaderm", campaign: "2026_followup", cohort: "wave1" },
  },
];

export function CampaignBuilder({ siteUrl }: { siteUrl: string }) {
  const [raw, setRaw] = useState<Record<AttributionKey, string>>({
    source: "",
    campaign: "",
    cohort: "",
    ref: "",
  });
  const [copied, setCopied] = useState<string | null>(null);

  const attribution = useMemo(() => {
    const out: Attribution = {};
    for (const key of ATTRIBUTION_KEYS) {
      const clean = sanitizeAttributionValue(raw[key]);
      if (clean) out[key] = clean;
    }
    return out;
  }, [raw]);

  const params = new URLSearchParams();
  for (const key of ATTRIBUTION_KEYS) {
    const v = attribution[key];
    if (v) params.set(key, v);
  }
  const query = params.toString();
  const url = `${siteUrl}/${query ? `?${query}` : ""}`;
  const anySanitised = ATTRIBUTION_KEYS.some(
    (k) => raw[k].trim() !== "" && (attribution[k] ?? "") !== raw[k].trim(),
  );

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard unavailable — the URL is selectable text right above.
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() =>
              setRaw({
                source: p.values.source ?? "",
                campaign: p.values.campaign ?? "",
                cohort: p.values.cohort ?? "",
                ref: "",
              })
            }
            className="inline-flex min-h-11 items-center rounded-md border border-rule-strong px-3.5 text-[13px] font-medium text-ink-muted transition-colors hover:border-ink-faint hover:text-ink"
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {ATTRIBUTION_KEYS.map((key) => (
          <label key={key} className="block">
            <span className="text-[12.5px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
              {FIELD_HELP[key].label}
            </span>
            <input
              type="text"
              value={raw[key]}
              onChange={(e) => setRaw((r) => ({ ...r, [key]: e.target.value }))}
              placeholder={FIELD_HELP[key].placeholder}
              className="mt-1.5 w-full rounded-md border border-rule-strong bg-paper-raised px-3 py-2.5 text-[14px] text-ink outline-none focus:border-ink-faint"
            />
            <span className="mt-1 block text-[12px] leading-relaxed text-ink-faint">
              {FIELD_HELP[key].help}
            </span>
          </label>
        ))}
      </div>

      {anySanitised ? (
        <p className="text-[12.5px] leading-relaxed text-signal-mid">
          Some values were adjusted: attribution is lowercased and reduced to
          letters, digits, dots, dashes and underscores — the same rule
          production applies to any URL, so what you see below is exactly what
          gets recorded.
        </p>
      ) : null}

      <div className="rounded-lg border border-rule bg-paper-raised p-5">
        <p className="text-[12px] uppercase tracking-[0.1em] text-ink-faint">
          Outreach URL
        </p>
        <p className="tnum mt-2 text-[14px] leading-relaxed text-ink break-all">
          {url}
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => copy(url)}
            className="inline-flex min-h-11 items-center rounded-md bg-accent px-4 text-[13px] font-semibold text-white transition-colors hover:bg-accent-ink"
          >
            {copied === url ? "Copied" : "Copy URL"}
          </button>
        </div>

        <div className="mt-5 border-t border-rule pt-4">
          <p className="text-[12px] uppercase tracking-[0.1em] text-ink-faint">
            What first-touch attribution will record
          </p>
          <p className="tnum mt-2 text-[13.5px] text-ink">
            {formatAttribution(attribution)}
          </p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-muted">
            Recorded once, in the visitor&apos;s browser, the first time they
            arrive with any attribution — and never overwritten. A physician who
            opens this link at a conference and comes back directly a week later
            still counts to this cohort. It appears against their session on the
            pilot dashboard and in the CSV export, joined by the opaque session
            id; the link itself carries nothing about the person.
          </p>
        </div>
      </div>
    </div>
  );
}
