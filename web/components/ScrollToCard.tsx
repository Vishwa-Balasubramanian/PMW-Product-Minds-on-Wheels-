"use client";

import { useEffect, useRef } from "react";

/**
 * Keeps the reading position when a requirement is opened. Requirement links use scroll={false},
 * so the page no longer jumps to the top. If the newly opened Decision Card would start hidden under the
 * sticky header and tabs (or below the screen on mobile), bring its top into view.
 * Runs only when the selected requirement changes, never on the first load (also safe under React's
 * double-run of effects in development).
 */
export function ScrollToCard({ targetId, selected }: { targetId: string; selected: string }) {
  const shown = useRef(selected);

  useEffect(() => {
    if (shown.current === selected) return;
    shown.current = selected;
    const el = document.getElementById(targetId);
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    const stickyBottom = 135; // sticky header (72px) + tab bar (57px), plus a little room
    if (top < stickyBottom || top > window.innerHeight - 120) {
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ block: "start", behavior: smooth ? "smooth" : "auto" });
    }
  }, [targetId, selected]);

  return null;
}
