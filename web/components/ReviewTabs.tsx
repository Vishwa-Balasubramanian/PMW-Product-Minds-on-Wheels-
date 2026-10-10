"use client";

import { useId, useRef, useState, type ReactNode } from "react";

const TABS = ["Overview", "Evidence", "Scoring", "Activity"] as const;

/** Only presentation state lives here; evidence is filtered and rendered on the server. */
export function ReviewTabs({ overview, evidence, scoring, activity }: Record<Lowercase<typeof TABS[number]>, ReactNode>) {
  const [active, setActive] = useState(0);
  const id = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const panels = [overview, evidence, scoring, activity];
  return (
    <div className="review-tabs">
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
