import Link from "next/link";
import type { Viewer } from "@/lib/gate";
import { BrandLogo } from "./BrandLogo";
import { RegionPicker } from "./RegionPicker";
import { MobileNav } from "./Sidebar";

/** Our own PMW wordmark: "P" in BMW Blue, "MW" in dark grey. Never combined into the BMW logo. */
export function Wordmark() {
  return (
    <Link href="/" className="flex items-baseline gap-2 text-ink">
      <span className="text-[22px] font-bold uppercase tracking-[0.02em] leading-none">
        <span className="pmw-p text-blue">P</span><span>MW</span>
      </span>
      <span className="hidden text-[12px] font-light text-ink-3 sm:inline">Product Minds on Wheels</span>
    </Link>
  );
}


/** White 72px header: BMW logo (provided file), divider, PMW wordmark, region picker, prototype label. Navigation lives in the Sidebar. */
export function Header({ viewer }: { viewer: Viewer; variant?: "overlay" | "solid" }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white">
      <div className="px-4 sm:px-8 lg:px-12">
        <div className="flex h-[71px] items-center gap-6">
          <div className="flex items-center gap-4">
            <MobileNav />
            <BrandLogo />
            <Wordmark />
          </div>
          <div className="ml-auto flex items-center gap-6">
            <RegionPicker region={viewer.region} />
            <span className="hidden text-[11px] text-ink-3 xl:inline">for BMW Group · Hackathon Prototype</span>
          </div>
        </div>
      </div>
    </header>
  );
}
