import Link from "next/link";

export function Wordmark({ subdued = false }: { subdued?: boolean }) {
  return (
    <Link
      href="/"
      className="group inline-flex min-h-11 shrink-0 items-center gap-2.5 whitespace-nowrap py-1 no-underline"
      aria-label="QNTM Practice Audit — home"
    >
      <span
        className={`text-[15px] font-bold tracking-[0.22em] ${
          subdued ? "text-ink-muted" : "text-ink"
        }`}
      >
        QNTM
      </span>
      <span className="h-3 w-px bg-rule-strong" aria-hidden />
      <span className="text-[13px] tracking-[0.06em] text-ink-faint">
        Practice Audit
      </span>
    </Link>
  );
}
