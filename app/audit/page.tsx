import { Suspense } from "react";
import { AuditFlow } from "@/components/audit-flow";

export const metadata = {
  title: "Practice Audit — QNTM",
  robots: { index: false, follow: true },
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  const { demo } = await searchParams;
  return (
    <Suspense fallback={null}>
      <AuditFlow demoId={demo} />
    </Suspense>
  );
}
