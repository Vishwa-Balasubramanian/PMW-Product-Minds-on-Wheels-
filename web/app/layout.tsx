import type { Metadata } from "next";
import "./globals.css";

// Font: Albert Sans, a stand-in for BMW Type Next (proprietary). Loaded with a plain stylesheet link:
// next/font/google failed under Turbopack after a cache reset, and this has no build step to break.
export const metadata: Metadata = {
  title: "Product Minds on Wheels",
  description: "Evidence-backed requirements for the next vehicle generation, with the product manager in control.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Albert+Sans:wght@300;400;500;600;700&display=swap" />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
