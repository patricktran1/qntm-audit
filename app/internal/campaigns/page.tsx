import Link from "next/link";
import { headers } from "next/headers";
import { CampaignBuilder } from "@/components/internal/campaign-builder";
import { InternalShell, Panel } from "@/components/internal/primitives";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Campaigns — QNTM internal",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * A link generator, deliberately nothing more. No sending, no lists, no
 * contacts — outreach is personal messages written by a person, per
 * PILOT_OUTREACH.md. This page only makes sure the attribution on those
 * links is well-formed and means what the operator thinks it means.
 */
export default async function CampaignsPage() {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "";
  const proto = requestHeaders.get("x-forwarded-proto") ?? "https";
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    (host ? `${proto}://${host}` : "");

  return (
    <InternalShell
      title="Campaigns"
      subtitle="Generate an attributed outreach link. Sending it is done by hand — this page manages no contacts and sends nothing."
      actions={
        <Link
          href="/internal/pilot"
          className="inline-flex min-h-11 items-center rounded-md border border-rule-strong px-3.5 text-[13px] font-medium text-ink-muted no-underline hover:text-ink"
        >
          Pilot dashboard
        </Link>
      }
    >
      <Panel
        title="Build a link"
        note="Values pass through the exact sanitisation production applies, so the preview is the truth."
      >
        <CampaignBuilder siteUrl={siteUrl} />
      </Panel>

      <Panel
        title="Conventions"
        note="Agreed once so cohort analysis stays coherent. Deviating is allowed; deviating accidentally is not."
      >
        <div className="rounded-lg border border-rule bg-paper-raised p-5 text-[13.5px] leading-relaxed text-ink-muted">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-ink">cohort=first10</strong> is the initial
              pilot cohort. The dashboard has a dedicated view for it.
            </li>
            <li>
              <strong className="text-ink">source</strong> answers &ldquo;where did
              they come from&rdquo; (leaderm, personal, referral);{" "}
              <strong className="text-ink">campaign</strong> answers &ldquo;which
              effort&rdquo; (founder_pilot, 2026_followup).
            </li>
            <li>
              <strong className="text-ink">ref</strong> distinguishes recipients
              when useful — never with a name. Attribution travels in a URL and
              lands in exports; it must stay anonymous.
            </li>
            <li>
              QR codes are deliberately not generated here: doing it well means
              either a new dependency or handing the URL to a third-party
              service. If one is needed for a booth, generate it locally from
              the copied URL.
            </li>
          </ul>
        </div>
      </Panel>
    </InternalShell>
  );
}
