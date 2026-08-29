/** Presentation helpers. No business logic lives here. */

export function currency(v: number | null, opts?: { precise?: boolean }): string {
  if (v === null || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (!opts?.precise && abs >= 1_000_000)
    return `$${(v / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  if (!opts?.precise && abs >= 10_000) return `$${Math.round(v / 1000)}K`;
  return `$${Math.round(v).toLocaleString("en-US")}`;
}

export function currencyExact(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return `$${Math.round(v).toLocaleString("en-US")}`;
}

export function percent(v: number | null, digits = 0): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

export function rawPercent(v: number | null, digits = 0): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(digits)}%`;
}

export function num(v: number | null, digits = 0): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function range(low: number, high: number): string {
  if (Math.round(low) === Math.round(high)) return currency(low);
  return `${currency(low)}–${currency(high)}`;
}

export function metricValue(
  value: number | null,
  unit: "currency" | "percent" | "number" | "hours" | "days" | "ratio",
): string {
  switch (unit) {
    case "currency":
      return currencyExact(value);
    case "percent":
      return percent(value, value !== null && Math.abs(value) < 0.1 ? 1 : 0);
    case "hours":
      return value === null ? "—" : `${num(value, 1)} hrs`;
    case "days":
      return value === null ? "—" : `${num(value, 0)} days`;
    default:
      return num(value, 0);
  }
}
