import Link from "next/link";
import type { Viewer } from "@/lib/gate";
import { BrandLogo } from "./BrandLogo";
import { RegionPicker } from "./RegionPicker";
import { MobileMenu, TopNav } from "./TopNav";

/** Our own PMW wordmark: "P" in BMW Blue, "MW" in dark grey, subtitle underneath. Never combined into the BMW logo. */
export function Wordmark() {
  return (
    <Link href="/" className="flex flex-col text-ink">
      <span className="text-[22px] font-bold uppercase leading-none tracking-[0.02em]">
        <span className="pmw-p text-blue">P</span><span>MW</span>
      </span>
      <span className="mt-1 hidden whitespace-nowrap text-[11px] font-light leading-none text-ink-3 sm:block">Product Minds on Wheels</span>
    </Link>
  );
}

/** White 72px top bar: BMW logo (provided file), divider, PMW wordmark, navigation, region picker, prototype label. */
export function Header({ viewer }: { viewer: Viewer; variant?: "overlay" | "solid" }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white">
      <div className="container-x relative">
        <div className="flex h-[71px] items-center gap-6">
          <div className="flex items-center gap-4">
            <MobileMenu />
            <BrandLogo />
            <Wordmark />
          </div>
          <TopNav />
          <div className="ml-auto flex shrink-0 items-center gap-6 whitespace-nowrap">
            <RegionPicker region={viewer.region} />
            <span className="hidden text-[11px] text-ink-3 xl:inline">for BMW Group · Hackathon Prototype</span>
          </div>
        </div>
      </div>
    </header>
  );
}
