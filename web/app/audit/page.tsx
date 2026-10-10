import Link from "next/link";
import { AuditTimeline } from "@/components/ui";
import { auditLog } from "@/lib/gate";

export const dynamic = "force-dynamic";

const FILTERS = [
  { k: "", label: "All" },
  { k: "G70", label: "7 Series" },
  { k: "G60", label: "5 Series" },
  { k: "F70", label: "1 Series" },
];

export default async function AuditPage({ searchParams }: PageProps<"/audit">) {
  const sp = await searchParams;
  const vehicle = typeof sp.vehicle === "string" ? sp.vehicle : "";
  const who = typeof sp.who === "string" ? sp.who : "";
  let events = await auditLog({ vehicle: vehicle || undefined, limit: 600 });
  if (who) events = events.filter((e) => e.actor_type === who);

  return (
    <div className="page-content">
      <h1 className="page-heading">Audit trail</h1>
      <p className="page-caption max-w-[720px]">
        A complete, chronological record of every AI step, product manager decision and access to customer evidence.
        Nothing here can be edited or deleted from the app.
      </p>
      <div className="mt-6 flex flex-wrap gap-2" aria-label="Audit filters">
        {FILTERS.map((f) => (
          <Link key={f.k} href={`/audit?vehicle=${f.k}${who ? `&who=${who}` : ""}`} className="filter-chip" aria-current={vehicle === f.k ? "true" : undefined}>{f.label}</Link>
        ))}
        <span className="mx-2 w-px bg-line" />
        {[{ k: "", l: "Everyone" }, { k: "pm", l: "Product managers" }, { k: "ai", l: "AI" }, { k: "system", l: "System and access" }].map((f) => (
          <Link key={f.k} href={`/audit?vehicle=${vehicle}${f.k ? `&who=${f.k}` : ""}`} className="filter-chip" aria-current={who === f.k ? "true" : undefined}>{f.l}</Link>
        ))}
      </div>
      <div className="mt-5 card p-4 sm:p-6">
        <p className="mb-4 text-[13px] text-ink-3">{events.length} events, newest first</p>
        <AuditTimeline events={events} />
      </div>
    </div>
  );
}
