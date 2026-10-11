"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

const TABS = ["Overview", "Evidence", "Scoring", "Activity"] as const;

/** Only presentation state lives here; evidence is filtered and rendered on the server. */
export function ReviewTabs({ overview, evidence, scoring, activity }: Record<Lowercase<typeof TABS[number]>, ReactNode>) {
  const search = useSearchParams();
  const requested = TABS.findIndex((tab) => tab.toLowerCase() === search.get("tab"));
  const [selection, setSelection] = useState({ query: search.toString(), active: Math.max(0, requested) });
  const active = selection.query === search.toString() ? selection.active : Math.max(0, requested);
  const setActive = (next: number) => setSelection({ query: search.toString(), active: next });
  const id = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const pendingQuote = useRef<string | null>(null);
  const panels = [overview, evidence, scoring, activity];
  useEffect(() => {
    if (active !== 1 || !pendingQuote.current) return;
    const quote = document.getElementById(pendingQuote.current);
    if (quote) {
      window.location.hash = quote.id;
      quote.scrollIntoView({ block: "center" });
      quote.focus({ preventScroll: true });
    }
    pendingQuote.current = null;
  }, [active]);
  return (
    <div className="review-tabs" onClick={(event) => {
      const link = (event.target as Element).closest<HTMLAnchorElement>('a[href^="#comment-"]');
      if (!link || active === 1 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      // A price-list match in Overview can link to a quote in the hidden Evidence tab.
      event.preventDefault();
      pendingQuote.current = link.hash.slice(1);
      setActive(1);
    }}>
      <div role="tablist" aria-label="Requirement details" className="review-tablist">
        {TABS.map((tab, index) => (
          <button key={tab} ref={(el) => { buttons.current[index] = el; }} id={`${id}-tab-${index}`} role="tab" aria-selected={active === index} aria-controls={`${id}-panel-${index}`} tabIndex={active === index ? 0 : -1}
            onClick={() => setActive(index)} onKeyDown={(event) => {
              let next: number;
              if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
              else if (event.key === "ArrowLeft") next = (index + TABS.length - 1) % TABS.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = TABS.length - 1;
              else return;
              event.preventDefault();
              setActive(next);
              buttons.current[next]?.focus();
            }}>{tab}</button>
        ))}
      </div>
      {panels.map((panel, index) => <div key={TABS[index]} id={`${id}-panel-${index}`} role="tabpanel" aria-labelledby={`${id}-tab-${index}`} hidden={active !== index} tabIndex={0} className="review-tabpanel">{panel}</div>)}
    </div>
  );
}
