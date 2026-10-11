"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import type { Viewer } from "@/lib/gate";
import { RegionPicker } from "./RegionPicker";
import { BrandLogo } from "./BrandLogo";

const VEHICLES = [
  { code: "G70", label: "7 Series" },
  { code: "G60", label: "5 Series" },
  { code: "F70", label: "1 Series" },
];

function NavIcon({ kind }: { kind: "portfolio" | "vehicle" | "audit" }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      {kind === "portfolio" ? <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>
        : kind === "audit" ? <path d="M5 4h14v17H5zM9 2v4m6-4v4M8 10h8M8 14h8M8 18h5" />
          : <path d="m5 9 2-5h10l2 5M3 10h18v8H3zM5 18v3m14-3v3M3 13h4m10 0h4" />}
    </svg>
  );
}

export function Header({ viewer }: { viewer: Viewer }) {
  const pathname = usePathname();
  const drawer = useRef<HTMLDialogElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const vehicle = VEHICLES.find((v) => pathname === `/vehicles/${v.code}`);
  const title = vehicle ? `BMW ${vehicle.label}` : pathname === "/audit" ? "Audit trail" : pathname === "/workflow" ? "Workflow" : pathname === "/portfolio" ? "Cross-Model Radar" : "Portfolio";

  function navigation(mobile = false) {
    return (
      <>
        <Link href="/" className="workspace-brand" onClick={() => drawer.current?.close()} aria-label="PMW portfolio">
          <span><span className="brand-symbol"><span className="text-blue">P</span>MW</span><span className="mt-1 block text-[10px] text-ink-3">Product Minds on Wheels</span></span>
        </Link>
        {mobile && <button className="drawer-close" onClick={() => drawer.current?.close()} aria-label="Close navigation">×</button>}
        <nav aria-label={mobile ? "Mobile navigation" : "Main"} className="workspace-nav">
          <p className="nav-label">Workspace</p>
          <Link href="/" className="nav-item" aria-current={pathname === "/" ? "page" : undefined} onClick={() => drawer.current?.close()}><NavIcon kind="portfolio" />Portfolio</Link>
          <Link href="/portfolio" className="nav-item" aria-current={pathname === "/portfolio" ? "page" : undefined} onClick={() => drawer.current?.close()}><NavIcon kind="portfolio" />Cross-Model Radar</Link>
          {/* Vehicle pages stay reachable by URL, the Cross-Model Radar and voice; hidden from the navigation. */}
          <p className="nav-label mt-7">Governance</p>
          {/* /workflow stays reachable by URL (backup for Q&A) but is hidden from the navigation. */}
          <Link href="/audit" className="nav-item" aria-current={pathname === "/audit" ? "page" : undefined} onClick={() => drawer.current?.close()}><NavIcon kind="audit" />Audit trail</Link>
        </nav>
        <div className="sidebar-footer"><BrandLogo /><span className="mb-2 block font-medium text-ink-2">Evidence → decisions</span>for BMW Group<br />Hackathon prototype</div>
      </>
    );
  }

  return (
    <>
      <a className="skip-link" href="#workspace-main">Skip to workspace</a>
      <aside className="workspace-sidebar">{navigation()}</aside>
      <header className="workspace-topbar">
        <button ref={menuButton} className="menu-button" aria-label="Open navigation" aria-haspopup="dialog" onClick={() => drawer.current?.showModal()}>
          <svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <div className="flex min-w-0 items-center gap-2 text-[13px]"><span className="hidden text-ink-3 sm:inline">Workspace</span><span className="hidden text-line sm:inline">/</span><span className="truncate font-medium">{title}</span></div>
        <div className="ml-auto shrink-0"><RegionPicker region={viewer.region} /></div>
      </header>
      <dialog ref={drawer} aria-label="Workspace navigation" className="navigation-drawer" onClose={() => menuButton.current?.focus()} onClick={(e) => { if (e.target === drawer.current) drawer.current.close(); }}>
        <div className="flex min-h-full flex-col">{navigation(true)}</div>
      </dialog>
    </>
  );
}
