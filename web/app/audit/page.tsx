import Link from "next/link";
import { Header } from "@/components/Header";
import { AuditTimeline } from "@/components/ui";
import { auditLog, getViewer } from "@/lib/gate";

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
  const viewer = await getViewer();
  let events = auditLog({ vehicle: vehicle || undefined, limit: 600 });
  if (who) events = events.filter((e) => e.actor_type === who);

  return (
    <main className="flex-1">
      <Header viewer={viewer} />
      <div className="container-x py-12">
        <h1 className="headline text-[36px]">Audit trail</h1>
        <p className="mt-3 max-w-[680px] text-[16px] text-ink-2">
          A complete, chronological record of every AI step, product manager decision and access to customer evidence.
          Nothing here can be edited or deleted from the app.
        </p>
        <div className="mt-8 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Link key={f.k} href={`/audit?vehicle=${f.k}${who ? `&who=${who}` : ""}`} className={`h-9 border px-4 text-[14px] leading-9 ${vehicle === f.k ? "border-ink bg-ink text-white" : "border-line hover:border-ink"}`}>{f.label}</Link>
          ))}
          <span className="mx-2 w-px bg-line" />
          {[{ k: "", l: "Everyone" }, { k: "pm", l: "Product managers" }, { k: "ai", l: "AI" }, { k: "system", l: "System and access" }].map((f) => (
            <Link key={f.k} href={`/audit?vehicle=${vehicle}${f.k ? `&who=${f.k}` : ""}`} className={`h-9 border px-4 text-[14px] leading-9 ${who === f.k ? "border-ink bg-ink text-white" : "border-line hover:border-ink"}`}>{f.l}</Link>
          ))}
        </div>
        <div className="mt-8 card p-6">
          <p className="mb-4 text-[13px] text-ink-3">{events.length} events, newest first</p>
          <AuditTimeline events={events} />
        </div>
      </div>
    </main>
  );
}
