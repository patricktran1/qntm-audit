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
