// MoSCoW group from the priority score. Shared by the UI and the requirement export.
// "Should have" starts at the decision-matrix priority threshold (55).
export const MOSCOW = [
  { key: "must", label: "Must have", min: 65, hint: "Must shape the next generation", text: "text-must", bg: "bg-must", dot: "bg-must" },
  { key: "should", label: "Should have", min: 55, hint: "Strong case, plan for it", text: "text-should", bg: "bg-should", dot: "bg-should" },
  { key: "could", label: "Could have", min: 45, hint: "Include if it fits", text: "text-could", bg: "bg-could", dot: "bg-could" },
  { key: "wont", label: "Won't have this time", min: 0, hint: "Revisit for a later update", text: "text-wont", bg: "bg-wont", dot: "bg-wont" },
] as const;

export function moscowFor(priority: number) {
  return MOSCOW.find((m) => priority >= m.min)!;
}
