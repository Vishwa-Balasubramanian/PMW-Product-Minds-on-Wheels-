// Mirrors the SQLite schema in pipeline/pmw/db.py. Keep the two in sync.

export type Quadrant = "act" | "validate" | "monitor" | "park";
export type Status = "proposed" | "approved" | "rejected" | "validate" | "edited";

export type Factor = { value: number; weight: number; note: string };
export type Factors = Record<string, Factor>;

export type SurveyRow = {
  market: string;
  variant: string | null;
  study: "US_2025" | "CN_EU_2025";
  attribute: string;
  mean: number;
  scale: 7 | 10;
  bottom3: number | null;
  top2: number | null;
  gap: number;
};

export type Conflict = { vehicle: string; attribute: string; cn: number; eu: number; delta: number };

export type Challenge = {
  issues: { penalty: number; text: string }[];
  revised_confidence: number;
  narrative?: string;
  narrative_source?: string;
  priority_sensitivity?: { min: number; max: number; crosses_threshold: boolean };
};

export type LabelSource = "bmw" | "ai" | "rule";

export type Requirement = {
  id: string;
  vehicle: string;
  signal_id: string;
  kind: "signal" | "quick_win" | "market_conflict";
  already_exists: EquipmentMatch[];
  title: string;
  customer_voice: string | null;
  signal_text: string | null;
  root_cause: string | null;
  customer_need: string | null;
  requirement: string;
  aspect: string | null;
  part: string | null;
  photo: string | null;
  focal_x: number | null;
  focal_y: number | null;
  markets: string[];
  future_lens: string | null;
  assumptions: string[];
  uncertainties: string[];
  contradictions: string[];
  survey: SurveyRow[];
  conflicts: Conflict[];
  priority: number;
  priority_factors: Factors;
  confidence: number;
  confidence_factors: Factors;
  quadrant: Quadrant;
  challenge: Challenge;
  challenged: boolean;
  status: Status;
  generated_by: string;
  created_at: string;
  updated_at: string;
};

export type EquipmentMatch = {
  vehicle: string;
  signal_or_requirement_id: string;
  feature: string;
  match_type: "option_same_vehicle" | "package_same_vehicle" | "standard_other_vehicle" | "standard_but_failing";
  equipment_name: string;
  code: string | null;
  price_eur: number | null;
  source_vehicle: string | null;
  feedback_ids: string[];
  note: string;
};

export type Quote = {
  id: string;
  text: string;
  source: string;
  market: string;
  country: string | null;
  powertrain: string | null;
  severity: string | null;
  role: "supports" | "contradicts";
};

export type AuditEvent = {
  id: number;
  ts: string;
  actor_type: "ai" | "pm" | "system";
  actor: string;
  region: string | null;
  entity_type: string;
  entity_id: string | null;
  action: string;
  field: string | null;
  before: string | null;
  after: string | null;
  rationale: string | null;
};

export type Signal = {
  id: string;
  vehicle: string;
  topic: string;
  n_comments: number;
  n_negative: number;
  n_likes: number;
  n_hard_to_use: number;
  n_defect: number;
  n_wants: number;
  dominant_issue: string | null;
  severity: number;
  competitor_mentions: number;
  by_market: Record<string, number>;
  by_source: Record<string, number>;
  in_scope: boolean;
  scope_reason: string | null;
  requirement_id: string | null;
};

/** Complete negative membership, distinct from the sampled signal_evidence table. */
export type SignalFeedback = { signal_id: string; feedback_id: string };

/** Evidence coverage by approved requirements, not measured customer satisfaction. */
export type HappinessRow = {
  market: string;
  negativeComments: number;
  coveredComments: number;
  share: number | null;
  salesWeight: number | null;
};

export type Weights = {
  priority: Record<string, number>;
  confidence: Record<string, number>;
  thresholds: { priority: number; confidence: number };
};

export const SOURCE_LABEL: Record<string, string> = {
  "Source A": "Owner review",
  "Source B": "Dealer note",
  "Source C": "Quality survey",
  "Source D": "Open survey answer",
};

export const POWERTRAIN_LABEL: Record<string, string> = {
  ICE: "Combustion",
  BEVE: "Electric",
  PHEV: "Plug-in hybrid",
};

export const QUADRANT: Record<Quadrant, { label: string; hint: string }> = {
  act: { label: "Act", hint: "High priority, strong evidence" },
  validate: { label: "Validate first", hint: "High priority, weak evidence" },
  monitor: { label: "Monitor", hint: "Lower priority, strong evidence" },
  park: { label: "Park", hint: "Lower priority, weak evidence" },
};

export const STATUS_LABEL: Record<Status, string> = {
  proposed: "Needs decision",
  approved: "Approved",
  rejected: "Rejected",
  validate: "Validation requested",
  edited: "Edited, needs decision",
};
