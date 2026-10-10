import type { Metadata } from "next";
import "./globals.css";

// Font: Albert Sans (stand-in for BMW Type Next), self-hosted in public/fonts, see globals.css.
// No analytics, no third-party requests. Search engines are told not to index (also robots.ts and next.config headers).
export const metadata: Metadata = {
  title: "PMW · Product Manager's Workbench",
  description: "Evidence-backed requirements for the next vehicle generation, with the product manager in control.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true, "max-snippet": 0, "max-image-preview": "none" },
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
