"use client";

import Link from "next/link";
import { track } from "@/lib/analytics";
import type { AuditResult } from "@/lib/engine/types";

/**
 * CONVERSION MODULE
 *
 * Generated from the verdict, so it can decline to ask for the meeting. The
 * three postures are visually different on purpose: a practice we are telling
 * not to buy anything should not see a button that looks like a sales CTA.
 */
export function ConversionModule({
  result,
  reportParam,
}: {
  result: AuditResult;
  reportParam: string;
}) {
  const { offer, topOpportunities } = result;
  const topCategory = topOpportunities[0]?.category ?? null;

  const href = `/talk?a=${encodeURIComponent(reportParam)}`;
  const onClick = () =>
    track({
      name: "cta_clicked",
      location: "report_conversion_module",
      posture: offer.posture,
      topCategory,
    });

  // Nothing to sell. Present it as a conclusion, not as an offer.
  if (offer.posture === "none") {
    return (
      <section className="no-print mt-16">
        <div className="rounded-lg border border-rule bg-paper-sunk p-7 sm:p-9">
          <p className="eyebrow">{offer.eyebrow}</p>
          <h2 className="display mt-3 max-w-2xl text-[1.45rem] leading-snug text-ink">
            {offer.headline}
          </h2>
          <p className="mt-3 max-w-2xl text-[14.5px] leading-relaxed text-ink-muted">
            {offer.body}
          </p>
          <p className="mt-5 border-t border-rule pt-4 text-[13px] leading-relaxed text-ink-faint">
            {offer.footnote}
          </p>
        </div>
      </section>
    );
  }

  const soft = offer.posture === "soft";

  return (
    <section className="no-print mt-16">
      <div
        className={`rounded-lg border p-7 sm:p-9 ${
          soft ? "border-rule bg-paper-raised" : "border-rule-strong bg-paper-raised"
        }`}
      >
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)] lg:gap-12">
          <div>
            <p className="eyebrow">{offer.eyebrow}</p>
            <h2 className="display mt-3 text-[1.45rem] leading-snug text-ink sm:text-[1.6rem]">
              {offer.headline}
            </h2>
            <p className="mt-3 max-w-2xl text-[14.5px] leading-relaxed text-ink-muted">
              {offer.body}
            </p>
          </div>

          <div className={soft ? "" : "lg:border-l lg:border-rule lg:pl-8"}>
            {offer.agenda.length > 0 ? (
              <>
                <p className="eyebrow">What we would look at</p>
                <ul className="mt-3 space-y-2">
                  {offer.agenda.map((item) => (
                    <li
                      key={item}
                      className="text-[13.5px] leading-relaxed text-ink-muted"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <Link
              href={href}
              onClick={onClick}
              className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-md bg-accent px-6 py-3.5 text-center text-[15px] font-semibold text-white no-underline transition-colors hover:bg-accent-ink"
            >
              {offer.primaryLabel}
            </Link>
            <p className="mt-3 text-[12.5px] leading-relaxed text-ink-faint">
              {offer.footnote}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
