"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type DragEvent, type ReactNode } from "react";
import { COLUMNS, SORTS, confidenceLevel, moveFor, type BoardCard, type BoardFilters, type BoardVehicle, type Move } from "@/lib/board";
import { useAgentFocus } from "@/lib/agentFocus";
import { MOSCOW, moscowFor } from "@/lib/moscow";
import { QUADRANT, STATUS_LABEL, type Quadrant, type Status } from "@/lib/types";

type Props = {
  cards: BoardCard[];
  filters: BoardFilters;
  query: string;
  basePath: string;
  vehicles: BoardVehicle[];
  region: string;
  fixedVehicle: string | null;
  threshold: number;
  /** Page heading (server-rendered). */
  heading: ReactNode;
  /** KPIs and availability notices (server-rendered), shown at the top of the right sidebar. */
  summary: ReactNode;
};
type Pending = { card: BoardCard; move: Extract<Move, { kind: "action" }> };

const REC_LABEL: Record<Quadrant, string> = { act: "Act", validate: "Validate First", monitor: "Monitor", park: "Park" };

export function RequirementsBoard({ cards, filters, query, basePath, vehicles, region, fixedVehicle, threshold, heading, summary }: Props) {
  const router = useRouter();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<Status | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState(filters.q);
  // Right sidebar: always shown on wide screens, a toggleable panel on smaller ones.
  const [sideOpen, setSideOpen] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, startNav] = useTransition();

  const href = (changes: Record<string, string | null>, path = basePath) => {
    const params = new URLSearchParams(query);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === "") params.delete(k); else params.set(k, v);
    }
    const s = params.toString();
    return `${path}${s ? `?${s}` : ""}`;
  };
  const setFilter = (k: string, v: string | null) => startNav(() => router.replace(href({ [k]: v, open: null, tab: null }), { scroll: false }));
  const openHref = (id: string, tab?: string) => href({ open: id, tab: tab ?? null });

  // Debounced search: the server filters, so the URL stays the single source of truth.
  useEffect(() => {
    if (search === filters.q) return;
    const t = setTimeout(() => setFilter("search", search.trim() || null), 250);
    return () => clearTimeout(t);
  });

  const say = (message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 6_000);
  };

  function requestMove(card: BoardCard, to: Status) {
    setMenu(null);
    const move = moveFor(card.status, to);
    if (!move) return;
    if (move.kind === "blocked") return say(move.message);
    if (move.kind === "edit") {
      say(`To move ${card.id} to Edited, change its text with Edit in the requirement panel.`);
      return startNav(() => router.push(openHref(card.id), { scroll: false }));
    }
    setPending({ card, move });
  }

  function changeVehicle(code: string) {
    if (fixedVehicle) return router.push(code === "all" ? href({ open: null, tab: null, vehicle: null }, "/") : href({ open: null, tab: null, vehicle: null }, `/vehicles/${code}`));
    setFilter("vehicle", code === "all" ? null : code);
  }

  const active = [filters.moscow, filters.conf, filters.rec, filters.q, filters.sort !== "priority" ? filters.sort : null].filter(Boolean).length;

  return (
    <div className="board-workspace">
      <div className="board-head">
        {heading}
        <div className="board-head-tools">
          <div className="board-layout-toggle" role="group" aria-label="Layout">
            <button type="button" aria-pressed={filters.layout === "board"} onClick={() => setFilter("layout", null)}>Board</button>
            <button type="button" aria-pressed={filters.layout === "list"} onClick={() => setFilter("layout", "list")}>List</button>
          </div>
          <button type="button" className="board-side-toggle btn-outline btn-sm" aria-expanded={sideOpen} aria-controls="board-side" onClick={() => setSideOpen(!sideOpen)}>
            Filters{active ? ` (${active})` : ""}
          </button>
        </div>
      </div>

      {notice && <p className="board-notice" role="status">{notice}</p>}

      <div className="board-shell">
      <div className="board-main">
      {filters.layout === "list" ? (
        <div className="board-list card">
          <table>
            <thead><tr><th>Requirement</th><th>Vehicle</th><th>Status</th><th>AI recommendation</th><th className="num">Priority</th><th className="num">Confidence</th><th className="num">Comments</th></tr></thead>
            <tbody>
              {cards.map((c) => (
                <tr key={c.id}>
                  <td><Link href={openHref(c.id)} scroll={false} className="board-list-title">{c.title}</Link><span className="font-mono">{c.id}</span></td>
                  <td>{c.vehicle}</td>
                  <td>{STATUS_LABEL[c.status]}</td>
                  <td>{REC_LABEL[c.quadrant]}{c.kind === "quick_win" ? " · Quick win" : ""}</td>
                  <td className="num">{c.priority}</td>
                  <td className="num">{c.confidence}</td>
                  <td className="num">{c.comments ?? "Survey only"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {cards.length === 0 && <p className="board-empty">No requirements match these filters.</p>}
        </div>
      ) : (
        <div className="board-columns" aria-label="Requirements board">
          {COLUMNS.map((col) => {
            const items = cards.filter((c) => c.status === col.status);
            return (
              <section
                key={col.status}
                className={`board-column ${over === col.status ? "is-over" : ""}`}
                aria-labelledby={`col-${col.status}`}
                onDragOver={(e) => { if (dragging) { e.preventDefault(); setOver(col.status); } }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }}
                onDrop={(e: DragEvent) => {
                  e.preventDefault();
                  setOver(null);
                  const card = cards.find((c) => c.id === e.dataTransfer.getData("text/plain"));
                  if (card) requestMove(card, col.status);
                }}
              >
                <header className="board-column-head">
                  <h2 id={`col-${col.status}`}>{col.title}</h2>
                  <span className="board-count" aria-label={`${items.length} requirements`}>{items.length}</span>
                </header>
                <p className="board-column-hint">{col.hint}</p>
                <ul className="board-cards">
                  {items.map((c) => (
                    <li key={c.id}>
                      <Card
                        c={c} threshold={threshold} openHref={openHref} menuOpen={menu === c.id}
                        dragging={dragging === c.id}
                        onDragStart={(e) => { e.dataTransfer.setData("text/plain", c.id); e.dataTransfer.effectAllowed = "move"; setDragging(c.id); }}
                        onDragEnd={() => { setDragging(null); setOver(null); }}
                        onMenu={() => setMenu(menu === c.id ? null : c.id)}
                        onMove={(to) => requestMove(c, to)}
                      />
                    </li>
                  ))}
                </ul>
                {items.length === 0 && <p className="board-empty">No requirements</p>}
              </section>
            );
          })}
        </div>
      )}

      </div>
      <aside id="board-side" className={`board-side ${sideOpen ? "is-open" : ""}`} aria-label="Summary and filters">
        <div className="board-side-bar">
          <span className="eyebrow">Summary & filters</span>
          <button type="button" className="board-side-close" aria-label="Close filters" onClick={() => setSideOpen(false)}>×</button>
        </div>
        {summary}
        <div className="board-filters" role="search" aria-label="Filter requirements">
          <label>Vehicle
            <select value={fixedVehicle ?? filters.vehicle} onChange={(e) => changeVehicle(e.target.value)}>
              <option value="all">All accessible vehicles</option>
              {vehicles.map((v) => <option key={v.code} value={v.code}>{v.code} · {v.name}{!v.available ? ` (not sold in ${region})` : v.thin ? ` (no comments in ${region})` : ""}</option>)}
            </select>
          </label>
          <label>Priority
            <select value={filters.moscow ?? ""} onChange={(e) => setFilter("priority", e.target.value || null)}>
              <option value="">All</option>
              {MOSCOW.map((m) => <option key={m.key} value={m.key}>{m.label.replace(" this time", "")}</option>)}
            </select>
          </label>
          <label>Evidence confidence
            <select value={filters.conf ?? ""} onChange={(e) => setFilter("conf", e.target.value || null)}>
              <option value="">All</option>
              <option value="high">High (70+)</option>
              <option value="medium">Medium ({threshold}–69)</option>
              <option value="low">Low (below {threshold})</option>
            </select>
          </label>
          <label>AI recommendation
            <select value={filters.rec ?? ""} onChange={(e) => setFilter("rec", e.target.value || null)}>
              <option value="">All</option>
              {(Object.keys(REC_LABEL) as Quadrant[]).map((q) => <option key={q} value={q}>{REC_LABEL[q]}</option>)}
              <option value="quick">Quick wins</option>
            </select>
          </label>
          <label>Sort
            <select value={filters.sort} onChange={(e) => setFilter("sort", e.target.value === "priority" ? null : e.target.value)}>
              {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>Search
            <input type="search" placeholder="Requirement name or ID" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
        </div>
      </aside>
      </div>

      {pending && <MoveDialog key={pending.card.id + pending.move.action} pending={pending} onClose={() => setPending(null)} onDone={(msg) => { setPending(null); say(msg); startNav(() => router.refresh()); }} />}
    </div>
  );
}

function Card({ c, threshold, openHref, menuOpen, dragging, onDragStart, onDragEnd, onMenu, onMove }: {
  c: BoardCard; threshold: number; openHref: (id: string, tab?: string) => string; menuOpen: boolean; dragging: boolean;
  onDragStart: (e: DragEvent) => void; onDragEnd: () => void; onMenu: () => void; onMove: (to: Status) => void;
}) {
  const weak = confidenceLevel(c.confidence, threshold) === "low";
  const band = moscowFor(c.priority);
  // Highlight while the voice agent investigates, proposes or just applied a decision.
  const focus = useAgentFocus(c.id);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (focus === "investigating" || focus === "done") ref.current?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [focus]);
  return (
    <article ref={ref} data-agent={focus} data-band={band.key} className={`board-card rec-line-${c.quadrant} ${dragging ? "is-dragging" : ""}`} draggable onDragStart={onDragStart} onDragEnd={onDragEnd} data-card-id={c.id} aria-label={c.title}>
      <div className="board-card-top">
        <Link href={openHref(c.id)} scroll={false} className="board-card-title">{c.title}</Link>
        <button type="button" className="board-card-move" aria-haspopup="menu" aria-expanded={menuOpen} aria-label={`Move ${c.id}`} title="Move to another column" onClick={onMenu}>⋯</button>
      </div>
      {menuOpen && (
        <div className="board-move-menu" role="menu" aria-label={`Move ${c.id} to`}>
          {COLUMNS.filter((col) => col.status !== c.status).map((col) => (
            <button key={col.status} type="button" role="menuitem" onClick={() => onMove(col.status)}>Move to {col.title}</button>
          ))}
        </div>
      )}
      <p className="board-card-meta"><span className="font-mono">{c.id}</span> · {c.vehicleName}</p>
      <dl className="board-card-scores">
        <div><dt>Priority</dt><dd>{c.priority}<span>/100</span></dd></div>
        <div><dt>Confidence</dt><dd className={weak ? "is-weak" : ""}>{c.confidence}<span>/100</span></dd></div>
      </dl>
      <p className="board-card-rec">AI recommendation: <b className={`rec-${c.quadrant}`}>{QUADRANT[c.quadrant].label}</b></p>
      <p className="board-card-evidence">{c.comments === null ? "Survey evidence only" : `${c.comments.toLocaleString("en-US")} customer comment${c.comments === 1 ? "" : "s"}`}</p>
      {(weak || c.representation.length > 0 || c.challenged || c.kind === "quick_win") && (
        <ul className="board-card-flags">
          {c.kind === "quick_win" && <li className="flag-quick">Quick win</li>}
          {weak && <li className="flag-warn" title={`Confidence below ${threshold}`}>Weak evidence</li>}
          {c.representation.length > 0 && <li className="flag-muted" title={c.representation.join(" ")}>Market underrepresented</li>}
          {c.challenged && <li className="flag-challenge">Challenged</li>}
        </ul>
      )}
    </article>
  );
}

function MoveDialog({ pending, onClose, onDone }: { pending: Pending; onClose: () => void; onDone: (message: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { card, move } = pending;
  useEffect(() => { dialog.current?.showModal(); }, []);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/requirements/${card.id}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: move.action, rationale: why }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) { setError(data.error ?? "Could not save this decision."); setBusy(false); return; }
      onDone(`${card.id}: ${move.submit.replace("Confirm ", "")} saved and recorded in the audit trail.`);
    } catch {
      setError("Could not save this decision. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <dialog ref={dialog} className="voice-confirm" aria-labelledby="move-title" onCancel={(e) => { e.preventDefault(); if (!busy) onClose(); }}>
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <h2 id="move-title">{move.title}</h2>
        <p className="mt-3"><b>{card.id}</b> · {card.title}</p>
        <p className="mt-1 text-[13px] text-ink-3">Currently {STATUS_LABEL[card.status]}. Nothing changes until you confirm.</p>
        <label className="mt-4 flex flex-col gap-1 text-[13px] font-medium">{move.prompt}
          <textarea autoFocus rows={2} className="border border-line bg-white px-3 py-2 font-normal" value={why} onChange={(e) => setWhy(e.target.value)} required={move.required} />
        </label>
        {error && <p role="alert" className="mt-3 text-[13px] text-danger">{error}</p>}
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" className="btn-outline" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Saving…" : move.submit}</button>
        </div>
        <p className="mt-3 text-[12px] text-ink-3">Recorded in the audit trail with your region and the time.</p>
      </form>
    </dialog>
  );
}
