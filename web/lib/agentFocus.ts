"use client";

// Which board cards the voice agent is working on. A module-level store so the
// highlight survives navigation between the home board and a vehicle board.
import { useSyncExternalStore } from "react";

export type FocusState = "investigating" | "investigated" | "proposed" | "done";
type FocusMap = Readonly<Record<string, FocusState>>;

const EMPTY: FocusMap = {};
let focus: FocusMap = EMPTY;
const listeners = new Set<() => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function emit(next: FocusMap) {
  focus = next;
  for (const listener of listeners) listener();
}

export const agentFocus = {
  get: () => focus,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  /** Set a card's state; "done" clears itself after a short highlight. */
  set(id: string, state: FocusState) {
    clearTimeout(timers.get(id));
    emit({ ...focus, [id]: state });
    if (state === "done") timers.set(id, setTimeout(() => agentFocus.remove(id), 4_000));
  },
  remove(id: string) {
    if (!(id in focus)) return;
    const next = { ...focus };
    delete next[id];
    emit(next);
  },
  clear() {
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
    emit(EMPTY);
  },
};

export function useAgentFocus(id: string): FocusState | undefined {
  return useSyncExternalStore(agentFocus.subscribe, agentFocus.get, () => EMPTY)[id];
}
