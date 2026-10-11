"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

/** Right-side panel over the board. Server-rendered content; closing removes ?open from the URL. */
export function RequirementDrawer({ closeHref, title, children }: { closeHref: string; title: string; children: ReactNode }) {
  const router = useRouter();
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    panel.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      // Dialogs (decision confirmations) handle their own Escape.
      if (event.key === "Escape" && !document.querySelector("dialog[open]")) router.replace(closeHref, { scroll: false });
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [closeHref, router]);
  return (
    <div className="drawer-root">
      <Link href={closeHref} scroll={false} className="drawer-backdrop" aria-label="Close requirement panel" tabIndex={-1} />
      <aside ref={panel} className="drawer-panel" role="dialog" aria-modal="false" aria-label={title} tabIndex={-1}>
        <div className="drawer-bar">
          <span className="eyebrow">Requirement</span>
          <Link href={closeHref} scroll={false} className="drawer-close" aria-label="Close requirement panel">×</Link>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  );
}
