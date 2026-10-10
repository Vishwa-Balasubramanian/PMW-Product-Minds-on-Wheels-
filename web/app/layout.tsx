import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { getViewer } from "@/lib/gate";

// Font: locally available BMW Type Next with self-hosted Inter fallback, see globals.css.
// No analytics, no third-party requests. Search engines are told not to index (also robots.ts and next.config headers).
export const metadata: Metadata = {
  title: "PMW · Product Minds on Wheels",
  description: "Evidence-backed requirements for the next vehicle generation, with the product manager in control.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true, "max-snippet": 0, "max-image-preview": "none" },
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const viewer = await getViewer();
  return (
    <html lang="en" className="h-full">
      <body>
        <Header viewer={viewer} />
        <main id="workspace-main" tabIndex={-1} className="workspace-main">{children}</main>
      </body>
    </html>
  );
}
