import { TalkForm } from "@/components/talk-form";

export const metadata = {
  title: "Request a review — QNTM Practice Audit",
  robots: { index: false, follow: false },
};

export default async function TalkPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string }>;
}) {
  const { a } = await searchParams;
  return <TalkForm report={a} />;
}
