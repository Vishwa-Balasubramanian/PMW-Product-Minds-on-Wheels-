import Link from "next/link";
import { Header } from "@/components/Header";
import { getViewer, listVehicles } from "@/lib/gate";

export const dynamic = "force-dynamic";

const fmt = (n: number) => n.toLocaleString("en-US");

const STEPS = [
  { title: "Customer voice", text: "10,128 comments, surveys, sales and price lists, cleaned into one evidence base." },
  { title: "Signals and root causes", text: "Recurring complaints, unmet needs and competitor pressure, grouped and explained." },
  { title: "Priority and confidence", text: "Two separate scores from transparent formulas, never from the model alone." },
  { title: "Product manager decides", text: "Approve, edit, reject, challenge or ask for validation. Every step is logged." },
];

export default async function Home() {
  const viewer = await getViewer();
  const vehicles = await listVehicles(viewer);
  // Deep demo vehicle first in the lane order the sketch uses: 1, 5, 7.
  const lanes = ["F70", "G60", "G70"].map((c) => vehicles.find((v) => v.code === c)!).filter(Boolean);

  return (
    <main className="flex-1">
      <Header viewer={viewer} />
      <section className="relative h-[max(620px,min(92vh,960px))] bg-night text-white">
        
        <div className="grid h-full grid-cols-1 md:grid-cols-3">
          {lanes.map((v, i) => (
            <article
              key={v.code}
              className="group relative isolate overflow-hidden border-white/15 md:border-r last:border-r-0 animate-rise"
              style={{ animationDelay: `${i * 120}ms` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={v.image}
                alt={`${v.name}, front three-quarter view`}
                className={`absolute inset-0 -z-10 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03] animate-settle ${v.available ? "" : "grayscale brightness-50"}`}
                style={{ animationDelay: `${i * 120}ms` }}
              />
              <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/25 to-black/45" />
              <div className="flex h-full flex-col justify-end gap-4 p-6 pb-10 sm:p-10">
                <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-white/75">{v.code} · Next generation</p>
                <h2 className="headline text-[34px] sm:text-[40px]">{v.name}</h2>
                {v.available ? (
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[14px] text-white/85">
                    <div><dt className="text-white/60">Customer comments</dt><dd className="font-medium text-white tabular-nums">{fmt(v.comments)}</dd></div>
                    <div><dt className="text-white/60">Sold in 2025</dt><dd className="font-medium text-white tabular-nums">{fmt(v.sales2025)}</dd></div>
                    <div><dt className="text-white/60">Requirements</dt><dd className="font-medium text-white tabular-nums">{v.requirements}</dd></div>
                    <div><dt className="text-white/60">Awaiting decision</dt><dd className="font-medium text-white tabular-nums">{v.awaiting}</dd></div>
                  </dl>
                ) : (
                  <p className="text-[15px] text-white/80">Not sold in {viewer.label}, so there is no evidence to review here.</p>
                )}
                {v.thin && (
                  <p className="border-l-2 border-validate pl-3 text-[14px] text-white/90">
                    Thin evidence: no customer comments from {viewer.label}. Requirements rest on survey means only.
                  </p>
                )}
                <div className="pt-2">
                  {v.available ? (
                    <Link href={`/vehicles/${v.code}`} className="btn-primary">Open requirements</Link>
                  ) : (
                    <span className="btn-ghost-light pointer-events-none opacity-60">Not available in your region</span>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="container-x py-20">
        <div className="mx-auto max-w-[720px] text-center">
          <h1 className="headline text-[32px] sm:text-[40px]">What should the next generation offer?</h1>
          <p className="mt-4 text-[17px] text-ink-2">
            Product Minds on Wheels (PMW) turns customer evidence into requirements a product manager can defend:
            every claim links to its source, and every decision stays with a person.
          </p>
        </div>
        <ol className="mt-14 grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex flex-col gap-3 bg-white p-8">
              <span className="text-[13px] font-medium tabular-nums text-blue">Step {i + 1}</span>
              <h3 className="text-[22px] font-light leading-tight">{s.title}</h3>
              <p className="text-[14px] text-ink-2">{s.text}</p>
            </li>
          ))}
        </ol>
        <div className="mt-12 flex flex-wrap justify-center gap-4">
          <Link href="/vehicles/G70" className="btn-primary">Start with the 7 Series</Link>
          <Link href="/audit" className="btn-outline">View the audit trail</Link>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="container-x flex flex-wrap justify-between gap-4 py-8 text-[13px] text-ink-3">
          <span>PMW · Product Minds on Wheels · EHL Grand Finale 2026 · BMW challenge prototype</span>
          <span>Vehicle photography from the BMW price lists provided for the hackathon.</span>
        </div>
      </footer>
    </main>
  );
}
