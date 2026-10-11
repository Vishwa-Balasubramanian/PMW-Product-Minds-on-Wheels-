import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { VoiceAgent } from "@/components/VoiceAgent";
import { getViewer } from "@/lib/gate";
import "./globals.css";

// Font: Albert Sans (stand-in for BMW Type Next), self-hosted in public/fonts, see globals.css.
// No analytics. The only third-party connection is the voice agent (OpenAI Realtime), and only after the PM clicks the microphone. Search engines are told not to index (also robots.ts and next.config headers).
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
      <body className="min-h-full flex flex-col">
        <Header viewer={viewer} />
        <div className="flex flex-1">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        </div>
        <VoiceAgent key={viewer.region} region={viewer.region} />
      </body>
    </html>
  );
}
