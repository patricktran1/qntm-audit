import Link from "next/link";
import { Suspense } from "react";
import { ReportView } from "@/components/report/report-view";
import { Wordmark } from "@/components/wordmark";
import { decodeAnswers } from "@/lib/share";

export const metadata = {
  title: "Your practice, decoded — QNTM Practice Audit",
  robots: { index: false, follow: false },
};

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string }>;
}) {
  const { a } = await searchParams;
  const answers = decodeAnswers(a);

  if (!answers) {
    return (
      <div className="mx-auto flex min-h-screen max-w-[620px] flex-col justify-center px-5 py-16 sm:px-8">
        <Wordmark />
        <h1 className="display mt-10 text-[2rem] leading-tight text-ink">
          That report link is incomplete
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-muted">
          Reports are generated entirely from the link — there is no account and
          nothing stored on our side, which is why a truncated or edited URL
          cannot be recovered. Running the audit again takes about five minutes.
        </p>
        <Link
          href="/audit"
          className="mt-8 inline-flex w-fit items-center justify-center rounded-md bg-accent px-6 py-3 text-[15px] font-semibold text-white no-underline transition-colors hover:bg-accent-ink"
        >
          Start audit
        </Link>
      </div>
    );
  }

  return (
    <Suspense fallback={null}>
      <ReportView answers={answers} />
    </Suspense>
  );
}
