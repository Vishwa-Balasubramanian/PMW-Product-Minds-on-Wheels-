import Link from "next/link";
import type { Viewer } from "@/lib/gate";
import { BrandLogo } from "./BrandLogo";
import { RegionPicker } from "./RegionPicker";

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

const NAV = [
  { href: "/vehicles/G70", label: "7 Series" },
  { href: "/vehicles/G60", label: "5 Series" },
  { href: "/vehicles/F70", label: "1 Series" },
  { href: "/workflow", label: "Workflow" },
  { href: "/audit", label: "Audit trail" },
];

/** White 72px header: BMW logo (provided file), divider, PMW wordmark, nav, region picker, prototype label. */
export function Header({ viewer }: { viewer: Viewer; variant?: "overlay" | "solid" }) {
  return (
    <header className="sticky top-0 z-30 bg-white">
      <div className="container-x">
        <div className="flex h-[72px] items-center gap-6 border-b border-line">
          <div className="flex items-center gap-4">
            <BrandLogo />
            <Wordmark />
          </div>
          <nav className="hidden items-center gap-6 md:flex" aria-label="Main">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="text-[13px] font-bold uppercase tracking-[0.05em] text-ink hover:text-blue">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-6">
            <RegionPicker region={viewer.region} />
            <span className="hidden text-[11px] text-ink-3 xl:inline">for BMW Group · Hackathon Prototype</span>
          </div>
        </div>
      </div>
    </header>
  );
}
