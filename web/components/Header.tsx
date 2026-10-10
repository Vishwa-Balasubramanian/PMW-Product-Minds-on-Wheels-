import Link from "next/link";
import type { Viewer } from "@/lib/gate";
import { RegionPicker } from "./RegionPicker";

export function Wordmark({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className={`flex items-center gap-3 ${light ? "text-white" : "text-ink"}`}>
      <span className="grid h-10 w-10 place-items-center rounded-full border-2 border-current text-[13px] font-bold tracking-wide">
        PMW
      </span>
      <span className="hidden text-[13px] leading-tight sm:block">
        <span className="block font-semibold uppercase tracking-[0.08em]">Product Minds</span>
        <span className="block font-light uppercase tracking-[0.08em]">on Wheels</span>
      </span>
    </Link>
  );
}

const NAV = [
  { href: "/vehicles/G70", label: "7 Series" },
  { href: "/vehicles/G60", label: "5 Series" },
  { href: "/vehicles/F70", label: "1 Series" },
  { href: "/audit", label: "Audit trail" },
];

/** variant "overlay" sits on top of photography (home). "solid" is the white app header. */
export function Header({ viewer, variant = "solid" }: { viewer: Viewer; variant?: "overlay" | "solid" }) {
  const light = variant === "overlay";
  return (
    <header className={light ? "absolute inset-x-0 top-0 z-30" : "sticky top-0 z-30 bg-white"}>
      <div className="container-x">
        <div className={`flex h-[84px] items-center gap-8 border-b ${light ? "border-white/60" : "border-line"}`}>
          <Wordmark light={light} />
          <nav className="hidden items-center gap-7 md:flex" aria-label="Main">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={`text-[15px] font-medium ${light ? "text-white hover:text-white/75" : "text-ink hover:text-blue"}`}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto">
            <RegionPicker region={viewer.region} light={light} />
          </div>
        </div>
      </div>
    </header>
  );
}
