"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export const NAV = [
  { href: "/vehicles/G70", label: "7 Series" },
  { href: "/vehicles/G60", label: "5 Series" },
  { href: "/vehicles/F70", label: "1 Series" },
  { href: "/board", label: "Board" },
  { href: "/portfolio", label: "Radar" },
  { href: "/workflow", label: "Workflow" },
  { href: "/audit", label: "Audit trail" },
];

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/** Desktop navigation in the top bar. The current page is underlined in BMW Blue. */
export function TopNav() {
  const pathname = usePathname();
  return (
    <nav className="hidden h-full items-stretch gap-5 xl:flex" aria-label="Main">
      {NAV.map((n) => {
        const on = isActive(pathname, n.href);
        return (
          <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined}
            className={`flex items-center whitespace-nowrap border-b-2 pt-0.5 text-[13px] font-bold uppercase tracking-[0.05em] ${on ? "border-blue text-ink" : "border-transparent text-ink hover:text-blue"}`}>
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Below 1280px: a menu button that drops the same links down from the top bar. */
export function MobileMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); button.current?.focus(); } };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open]);
  return (
    <div className="xl:hidden">
      <button ref={button} type="button" aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? "Close navigation" : "Open navigation"}
        onClick={() => setOpen(!open)} className="grid h-10 w-10 place-items-center border border-line">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
        </svg>
      </button>
      {open && (
        <nav id="mobile-menu" aria-label="Main" className="absolute inset-x-0 top-full border-b border-line bg-white">
          <ul className="mx-auto w-full max-w-[1280px] px-4 py-2 sm:px-8">
            {NAV.map((n) => {
              const on = isActive(pathname, n.href);
              return (
                <li key={n.href}>
                  <Link href={n.href} aria-current={on ? "page" : undefined} onClick={() => setOpen(false)}
                    className={`block border-l-[3px] px-4 py-3 text-[13px] font-bold uppercase tracking-[0.05em] ${on ? "border-blue bg-mist" : "border-transparent hover:bg-mist"}`}>
                    {n.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}
