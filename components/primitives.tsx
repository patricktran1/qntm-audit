import type { ReactNode } from "react";
import type { Confidence, Level } from "@/lib/engine/types";

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="eyebrow">{children}</p>;
}

export function Rule({ className = "" }: { className?: string }) {
  return <hr className={`border-0 border-t border-rule ${className}`} />;
}

const CONFIDENCE_COPY: Record<Confidence, { label: string; help: string }> = {
  high: {
    label: "High confidence",
    help: "Calculated directly from figures you supplied, with no behavioural assumption in the chain.",
  },
  medium: {
    label: "Medium confidence",
    help: "Derived using one or more of the economic assumptions listed at the end of this report.",
  },
  low: {
    label: "Low confidence",
    help: "A plausible signal that leans on an assumption about behaviour we cannot verify. Measure before spending against it.",
  },
};

export function ConfidenceChip({ level }: { level: Confidence }) {
  const tone =
    level === "high"
      ? "text-signal-strong border-signal-strong/30 bg-signal-strong/6"
      : level === "medium"
        ? "text-signal-mid border-signal-mid/30 bg-signal-mid/6"
        : "text-signal-weak border-signal-weak/30 bg-signal-weak/6";
  return (
    <span
      title={CONFIDENCE_COPY[level].help}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${tone}`}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full bg-current"
      />
      {CONFIDENCE_COPY[level].label}
    </span>
  );
}

export function LevelChip({
  label,
  level,
}: {
  label: string;
  level: Level;
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5 text-[11px] uppercase tracking-[0.1em] text-ink-faint">
      <span className="font-semibold">{label}</span>
      <span className="font-semibold text-ink normal-case tracking-normal text-xs">
        {level === "low" ? "Low" : level === "medium" ? "Medium" : "High"}
      </span>
    </span>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`print-block rounded-lg border border-rule bg-paper-raised ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Provenance marker. Three states, visually distinct, used everywhere a number
 * appears: what the practice told us, what we calculated, and what we do not
 * know. Making these distinguishable at a glance is the difference between a
 * report a CFO can audit and one they have to trust.
 */
export type Provenance = "observed" | "estimated" | "unknown";

const PROVENANCE_COPY: Record<Provenance, { mark: string; label: string; help: string }> = {
  observed: {
    mark: "\u25CF",
    label: "Reported",
    help: "A figure you entered. Not modified by this audit.",
  },
  estimated: {
    mark: "\u0192",
    label: "Calculated",
    help: "Derived by this audit from your answers and the stated assumptions.",
  },
  unknown: {
    mark: "\u2014",
    label: "Not known",
    help: "You skipped this, so it is excluded rather than guessed at.",
  },
};

export function ProvenanceMark({ kind }: { kind: Provenance }) {
  const meta = PROVENANCE_COPY[kind];
  const tone =
    kind === "observed"
      ? "text-accent"
      : kind === "estimated"
        ? "text-ink-faint"
        : "text-rule-strong";
  return (
    <span
      className={`ml-1 select-none text-[10px] leading-none ${tone}`}
      title={`${meta.label} — ${meta.help}`}
      aria-label={meta.label}
      role="img"
    >
      {meta.mark}
    </span>
  );
}

/** The key that explains the marks. Rendered once per section that uses them. */
export function ProvenanceKey({ className = "" }: { className?: string }) {
  return (
    <p className={`text-[11.5px] leading-relaxed text-ink-faint ${className}`}>
      <span className="text-accent">{PROVENANCE_COPY.observed.mark}</span>{" "}
      reported by you
      <span className="mx-2 text-rule-strong">·</span>
      <span className="text-ink-faint">{PROVENANCE_COPY.estimated.mark}</span>{" "}
      calculated by this audit
      <span className="mx-2 text-rule-strong">·</span>
      <span className="text-rule-strong">{PROVENANCE_COPY.unknown.mark}</span>{" "}
      not known, and excluded rather than guessed
    </p>
  );
}

/**
 * The standing caveat that must appear beside every rolled-up dollar figure.
 * Written once so it cannot drift between the report and the sales brief.
 */
export const ESTIMATE_CAVEAT =
  "Diagnostic opportunity estimates, not promised savings. These are computed from your inputs and the assumptions in this report, they overlap where findings draw on the same hours or slots, and no part of this audit establishes that acting on them would realise the figure shown.";

export function EstimateCaveat({ className = "" }: { className?: string }) {
  return (
    <p
      className={`border-l-2 border-signal-mid/40 pl-3 text-[12px] leading-relaxed text-ink-muted ${className}`}
    >
      <span className="font-semibold text-ink">
        Diagnostic estimates, not promised savings.
      </span>{" "}
      {ESTIMATE_CAVEAT.split("not promised savings. ")[1]}
    </p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  children,
  id,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
  id?: string;
}) {
  return (
    <div id={id} className="mb-6 scroll-mt-24">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="display mt-2 text-2xl leading-tight text-ink sm:text-3xl">
        {title}
      </h2>
      {children ? (
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-muted">
          {children}
        </p>
      ) : null}
    </div>
  );
}
