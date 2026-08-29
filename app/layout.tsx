import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "QNTM Practice Audit — where your practice is losing time and money",
  description:
    "A 5-minute operational diagnostic for independent dermatology practices. Answer 13 questions, get a transparent read on where capacity and revenue are leaking, what it is plausibly worth, and what to measure next.",
  openGraph: {
    title: "QNTM Practice Audit",
    description:
      "Thirteen questions. A transparent read on where your practice is losing time and money — with every assumption shown.",
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
