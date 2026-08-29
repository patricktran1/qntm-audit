import type { ReactNode } from "react";
import { MODEL_VERSION, PILOT_FREEZE } from "@/lib/engine/version";
import { formatRatio, isSmallSample, type Ratio } from "@/lib/pilot/analyse";

/**
 * Internal UI primitives. Denser than the public product, but not an admin
 * template: tables where tables are better, raw counts always visible, and no
 * percentage without its denominator.
 */

export function InternalShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[1120px] px-5 py-8 sm:px-8 sm:py-12">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-rule pb-6">
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="eyebrow">QNTM internal</p>
            {/* The pilot collects evidence against exactly one model. Every
                internal surface says which, so a mid-pilot bump is visible
                the moment it happens. */}
            <span
              className={`rounded-sm border px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] ${
                PILOT_FREEZE.active && PILOT_FREEZE.version === MODEL_VERSION
                  ? "border-rule-strong text-ink-faint"
                  : "border-signal-weak/50 text-signal-weak"
              }`}
            >
              {PILOT_FREEZE.active
                ? PILOT_FREEZE.version === MODEL_VERSION
                  ? `model ${MODEL_VERSION} · pilot freeze`
                  : `model ${MODEL_VERSION} ≠ frozen ${PILOT_FREEZE.version}`
                : `model ${MODEL_VERSION} · no freeze`}
            </span>
          </div>
          <h1 className="display mt-2 text-[1.9rem] leading-tight text-ink">
            {title}
          </h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-muted">
            {subtitle}
          </p>
        </div>
        {/* Not shrink-0: with four nav buttons this row is wider than a phone,
            and a rigid row pushes the whole page sideways. It wraps instead. */}
        <div className="flex min-w-0 flex-wrap items-center gap-3">{actions}</div>
      </header>
      {children}
    </div>
  );
}

export function Panel({
  title,
  note,
  children,
  className = "",
}: {
  title: string;
  note?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`mt-10 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink">
          {title}
        </h2>
      </div>
      {note ? (
        <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-ink-muted">
          {note}
        </p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** A count with its denominator. Never a bare percentage during the pilot. */
export function RatioCell({ value }: { value: Ratio }) {
  return (
    <span className="tnum">
      {formatRatio(value)}
      {isSmallSample(value.denominator) && value.denominator > 0 ? (
        <span
          className="ml-1.5 text-[10px] uppercase tracking-wide text-signal-mid"
          title="Fewer than 10 observations. Descriptive only — do not read a trend into this."
        >
          small n
        </span>
      ) : null}
    </span>
  );
}

export function StatTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail?: string;
}) {
  return (
    <div className="bg-paper-raised px-4 py-3.5">
      <p className="tnum display text-[1.6rem] leading-none text-ink">{value}</p>
      <p className="mt-1.5 text-[11px] uppercase tracking-[0.08em] text-ink-faint">
        {label}
      </p>
      {detail ? (
        <p className="mt-1 text-[12px] leading-snug text-ink-muted">{detail}</p>
      ) : null}
    </div>
  );
}

export function TileGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-px overflow-hidden rounded-lg border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
      {children}
    </div>
  );
}

export function Table({
  head,
  children,
  minWidth = 560,
}: {
  head: string[];
  children: ReactNode;
  minWidth?: number;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-rule bg-paper-raised">
      <table
        className="w-full border-collapse text-left"
        style={{ minWidth: `${minWidth}px` }}
      >
        <thead>
          <tr className="border-b border-rule-strong">
            {head.map((h, i) => (
              <th
                key={h}
                className={`px-4 py-2.5 text-[11px] uppercase tracking-[0.1em] text-ink-faint ${
                  i === 0 ? "" : "text-right"
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <tr className="border-b border-rule last:border-0">{children}</tr>;
}

export function Cell({
  children,
  first = false,
  muted = false,
}: {
  children: ReactNode;
  first?: boolean;
  muted?: boolean;
}) {
  return (
    <td
      className={`px-4 py-2.5 text-[13.5px] ${first ? "" : "text-right tnum"} ${
        muted ? "text-ink-muted" : "text-ink"
      }`}
    >
      {children}
    </td>
  );
}

/** Horizontal count bar. Used only where a shape is genuinely easier to read. */
export function CountBar({
  label,
  count,
  total,
  tone = "accent",
}: {
  label: string;
  count: number;
  total: number;
  tone?: "accent" | "strong" | "mid" | "weak";
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  const bg = {
    accent: "bg-accent",
    strong: "bg-signal-strong",
    mid: "bg-signal-mid",
    weak: "bg-signal-weak",
  }[tone];
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[13.5px] capitalize text-ink">{label}</span>
        <span className="tnum shrink-0 text-[13px] text-ink-muted">
          {count} / {total}
        </span>
      </div>
      <div className="mt-1.5 h-[6px] w-full overflow-hidden rounded-full bg-paper-sunk">
        <div
          className={`h-full rounded-full ${bg}`}
          style={{ width: `${Math.max(count > 0 ? 2 : 0, pct)}%` }}
        />
      </div>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-rule-strong px-5 py-8 text-center text-[14px] leading-relaxed text-ink-muted">
      {children}
    </p>
  );
}

export function Warning({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-signal-weak/40 bg-signal-weak/5 px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-signal-weak">
        Model integrity
      </p>
      <p className="mt-1.5 text-[14px] leading-relaxed text-ink">{children}</p>
    </div>
  );
}

export function StoreBanner({ configured }: { configured: boolean }) {
  if (configured) return null;
  return (
    <div className="mt-6 rounded-lg border border-signal-mid/40 bg-signal-mid/5 px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-signal-mid">
        No pilot store configured
      </p>
      <p className="mt-1.5 max-w-3xl text-[14px] leading-relaxed text-ink">
        Audits are running and the product is fully functional, but nothing is
        being retained, so this page will stay empty. Set{" "}
        <code className="tnum rounded bg-paper-sunk px-1.5 py-0.5 text-[13px]">
          PILOT_KV_REST_URL
        </code>{" "}
        and{" "}
        <code className="tnum rounded bg-paper-sunk px-1.5 py-0.5 text-[13px]">
          PILOT_KV_REST_TOKEN
        </code>{" "}
        to start collecting evidence.
      </p>
    </div>
  );
}
