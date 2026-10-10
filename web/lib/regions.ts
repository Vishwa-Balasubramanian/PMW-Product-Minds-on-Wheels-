// Shared by server and client. A region decides which markets' raw customer evidence a viewer can see.
export const MARKETS = ["US", "EU", "CN", "ROW"] as const;
export type Market = (typeof MARKETS)[number];
export type RegionCode = Market | "ALL";

export const REGIONS: { code: RegionCode; label: string; role: string }[] = [
  { code: "US", label: "United States", role: "Market product manager" },
  { code: "EU", label: "Europe", role: "Market product manager" },
  { code: "CN", label: "China", role: "Market product manager" },
  { code: "ROW", label: "Rest of World", role: "Market product manager" },
  { code: "ALL", label: "All markets", role: "Head of product" },
];

export const MARKET_LABEL: Record<string, string> = {
  US: "United States",
  EU: "Europe",
  CN: "China",
  ROW: "Rest of World",
  ALL: "All markets",
};

export const DEFAULT_REGION: RegionCode = "US";
export const REGION_COOKIE = "pmw_region";

export function isRegion(v: unknown): v is RegionCode {
  return typeof v === "string" && REGIONS.some((r) => r.code === v);
}

export function marketsFor(region: RegionCode): Market[] {
  return region === "ALL" ? [...MARKETS] : [region];
}
