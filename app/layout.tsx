import type { Metadata, Viewport } from "next";
import { STEPS } from "@/lib/engine/questions";
import "./globals.css";

// Derived rather than written, so the copy cannot drift from the question set.
// One of the two mutually exclusive billing sub-questions is never shown.
const QUESTION_COUNT = STEPS.reduce((s, step) => s + step.fields.length, 0) - 1;

export const metadata: Metadata = {
  title: "QNTM Practice Audit — where your practice is losing time and money",
  description: `A 5-minute operational diagnostic for independent dermatology practices. Answer ${QUESTION_COUNT} questions and get a transparent read on where capacity and revenue are leaking, what it is plausibly worth, and what to measure next.`,
  openGraph: {
    title: "QNTM Practice Audit",
    description: `${QUESTION_COUNT} questions. A transparent read on where your practice is losing time and money — with every assumption shown.`,
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#fbfaf8",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
