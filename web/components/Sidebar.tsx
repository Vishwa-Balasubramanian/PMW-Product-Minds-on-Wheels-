"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";

const GROUPS = [
  {
    label: "Vehicles",
    items: [
      { href: "/vehicles/G70", label: "7 Series" },
      { href: "/vehicles/G60", label: "5 Series" },
      { href: "/vehicles/F70", label: "1 Series" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { href: "/board", label: "Requirements board" },
      { href: "/portfolio", label: "Cross-Model Radar" },
      { href: "/workflow", label: "Workflow" },
      { href: "/audit", label: "Audit trail" },
    ],
  },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-8">
      {GROUPS.map((g) => (
        <div key={g.label}>
          <p className="eyebrow mb-2 px-6">{g.label}</p>
          <ul>
            {g.items.map((i) => {
              const on = pathname === i.href;
              return (
                <li key={i.href}>
                  <Link href={i.href} onClick={onNavigate} aria-current={on ? "page" : undefined}
                    className={`block border-l-[3px] px-6 py-2.5 text-[13px] font-bold uppercase tracking-[0.05em] ${on ? "border-blue bg-mist text-ink" : "border-transparent text-ink-2 hover:bg-mist hover:text-ink"}`}>
                    {i.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Desktop: a fixed sidebar below the 72px header. */
export function Sidebar() {
  return (
    <aside className="sticky top-[72px] hidden h-[calc(100vh-72px)] w-[220px] shrink-0 overflow-y-auto border-r border-line bg-white py-8 lg:block">
      <NavList />
    </aside>
  );
}

/** Below lg: a menu button in the header that opens the same navigation as a panel. */
export function MobileNav() {
  const dialog = useRef<HTMLDialogElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const close = () => dialog.current?.close();
  return (
    <>
      <button ref={button} type="button" className="grid h-10 w-10 place-items-center border border-line lg:hidden" aria-label="Open navigation" aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
      </button>
      <dialog ref={dialog} aria-label="Navigation" onClose={() => button.current?.focus()} onClick={(e) => { if (e.target === dialog.current) close(); }}
        className="m-0 h-full max-h-none w-[280px] max-w-[85vw] bg-white py-6 backdrop:bg-ink/50">
        <div className="mb-6 flex justify-end px-4">
          <button type="button" onClick={close} className="grid h-10 w-10 place-items-center border border-line" aria-label="Close navigation">×</button>
        </div>
        <NavList onNavigate={close} />
      </dialog>
    </>
  );
}
