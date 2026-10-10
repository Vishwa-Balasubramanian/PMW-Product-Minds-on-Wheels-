"""SQLite schema. This file is the contract between the pipeline and the web app.

Change it only with the whole team: the web app reads these tables directly.
"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone

from .config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS vehicles (
  code TEXT PRIMARY KEY,           -- F70, G60, G70
  name TEXT NOT NULL,
  short TEXT NOT NULL,
  image TEXT
);

-- One row per customer comment (an ID in the Excel files).
CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,             -- e.g. G70-0001
  vehicle TEXT NOT NULL,
  source TEXT NOT NULL,            -- Source A..D
  country TEXT,
  market TEXT NOT NULL,            -- US, EU, CN, ROW
  powertrain TEXT,                 -- ICE, BEVE, PHEV
  text TEXT NOT NULL,
  severity TEXT,                   -- Source C only: very minor, minor, moderate, serious, very serious
  competitors TEXT,                -- comma list of competitor brands named in the text
  classified INTEGER NOT NULL      -- 1 if BMW gave at least one topic label
);
CREATE INDEX IF NOT EXISTS idx_feedback_vehicle ON feedback(vehicle, market);

-- One row per label: a comment can carry several (topic, type) labels.
CREATE TABLE IF NOT EXISTS feedback_labels (
  feedback_id TEXT NOT NULL,
  feedback_type TEXT,              -- Likes, Difficult to Use, Defect, Wants
  topic TEXT,                      -- BMW taxonomy level 2
  subtopic TEXT,                   -- BMW taxonomy level 3
  label_source TEXT NOT NULL DEFAULT 'bmw'   -- bmw | ai | rule (provisional offline labels)
);
CREATE INDEX IF NOT EXISTS idx_labels_fb ON feedback_labels(feedback_id);
CREATE INDEX IF NOT EXISTS idx_labels_topic ON feedback_labels(topic);

-- Customer studies, normalised. US: 7-point distributions. CN/EU: 1-10 means.
CREATE TABLE IF NOT EXISTS survey_scores (
  vehicle TEXT NOT NULL,
  variant TEXT,                    -- e.g. G68 (5 Series long wheelbase, China)
  market TEXT NOT NULL,
  study TEXT NOT NULL,             -- US_2025 | CN_EU_2025
  attribute TEXT NOT NULL,
  mean REAL,
  scale INTEGER NOT NULL,          -- 7 or 10
  bottom3 REAL,                    -- US only: share of the three lowest answers
  top2 REAL,                       -- US only: share of the two highest answers
  in_scope INTEGER NOT NULL DEFAULT 1,
  scope_reason TEXT
);

CREATE TABLE IF NOT EXISTS sales (
  vehicle TEXT NOT NULL,
  market TEXT NOT NULL,
  year INTEGER NOT NULL,
  volume INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS equipment (
  vehicle TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT,                       -- SA code, e.g. 7VB
  price_eur REAL,
  availability TEXT NOT NULL,      -- standard | optional | package_item | unknown
  package TEXT,                    -- package name when availability = package_item
  trim TEXT,
  raw TEXT
);

-- Customer wishes or complaints checked against price-list equipment.
CREATE TABLE IF NOT EXISTS equipment_matches (
  vehicle TEXT NOT NULL,
  signal_or_requirement_id TEXT NOT NULL,
  match_type TEXT NOT NULL,         -- option_same_vehicle | package_same_vehicle | standard_other_vehicle | standard_but_failing
  equipment_name TEXT NOT NULL,
  code TEXT,
  price_eur REAL,
  source_vehicle TEXT,
  feedback_ids TEXT NOT NULL,       -- JSON array of source comment IDs
  note TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS data_issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset TEXT NOT NULL,
  vehicle TEXT,
  severity TEXT NOT NULL,          -- info | warning | critical
  description TEXT NOT NULL,
  handling TEXT NOT NULL
);

-- Missing voices: feedback share vs sales share per market.
CREATE TABLE IF NOT EXISTS representation (
  vehicle TEXT NOT NULL,
  market TEXT NOT NULL,
  feedback_n INTEGER NOT NULL,
  feedback_share REAL NOT NULL,
  sales_2025 INTEGER NOT NULL,
  sales_share REAL NOT NULL,
  sales_2030 INTEGER NOT NULL
);

-- Market conflicts from the CN/EU study.
CREATE TABLE IF NOT EXISTS market_conflicts (
  vehicle TEXT NOT NULL,
  attribute TEXT NOT NULL,
  cn REAL, eu REAL, delta REAL,
  in_scope INTEGER NOT NULL,
  scope_reason TEXT
);

CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY,             -- S-G70-001
  vehicle TEXT NOT NULL,
  topic TEXT NOT NULL,
  n_comments INTEGER NOT NULL,
  n_negative INTEGER NOT NULL,
  n_likes INTEGER NOT NULL,
  n_hard_to_use INTEGER NOT NULL,
  n_defect INTEGER NOT NULL,
  n_wants INTEGER NOT NULL,
  dominant_issue TEXT,
  severity REAL NOT NULL,          -- 0..1
  competitor_mentions INTEGER NOT NULL,
  by_market TEXT NOT NULL,         -- JSON {US: n, ...}
  by_source TEXT NOT NULL,         -- JSON {Source A: n, ...}
  in_scope INTEGER NOT NULL,
  scope_reason TEXT
);

CREATE TABLE IF NOT EXISTS signal_evidence (
  signal_id TEXT NOT NULL,
  feedback_id TEXT NOT NULL,
  role TEXT NOT NULL               -- supports | contradicts
);

CREATE TABLE IF NOT EXISTS requirements (
  id TEXT PRIMARY KEY,             -- R-G70-001
  vehicle TEXT NOT NULL,
  signal_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'signal', -- signal | quick_win | market_conflict
  already_exists TEXT NOT NULL DEFAULT '[]', -- JSON equipment match rows
  title TEXT NOT NULL,
  customer_voice TEXT,             -- the ladder: voice -> signal -> root cause -> need -> requirement
  signal_text TEXT,
  root_cause TEXT,
  customer_need TEXT,
  requirement TEXT NOT NULL,
  aspect TEXT,                     -- Cockpit | Interior | Exterior | Driving | Vehicle
  part TEXT,                       -- e.g. Gear selector
  photo TEXT,                      -- web path, e.g. /cars/F70/cockpit.jpg
  focal_x INTEGER,                 -- focal point in % of the photo, for cropping
  focal_y INTEGER,
  markets TEXT NOT NULL,           -- JSON list of markets with evidence
  future_lens TEXT,                -- current_pain | emerging | future_must_have
  assumptions TEXT NOT NULL,       -- JSON list
  uncertainties TEXT NOT NULL,     -- JSON list
  contradictions TEXT NOT NULL,    -- JSON list
  survey TEXT NOT NULL,            -- JSON list of survey evidence rows
  conflicts TEXT NOT NULL,         -- JSON list of market conflicts that touch this requirement
  priority INTEGER NOT NULL,       -- 0..100, deterministic
  priority_factors TEXT NOT NULL,  -- JSON {factor: {value, weight, note}}
  confidence INTEGER NOT NULL,     -- 0..100, deterministic, separate from priority
  confidence_factors TEXT NOT NULL,
  quadrant TEXT NOT NULL,          -- act | validate | monitor | park
  challenge TEXT NOT NULL,         -- JSON {issues, revised_confidence, narrative?, narrative_source?, priority_sensitivity?}
  challenged INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'proposed',  -- proposed | approved | rejected | validate | edited
  generated_by TEXT NOT NULL,      -- evidence-template:v2 | llm:<model> | cache:llm:<model>
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Append-only. Every AI step, PM decision and access event.
CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  actor_type TEXT NOT NULL,        -- ai | pm | system
  actor TEXT NOT NULL,
  region TEXT,
  entity_type TEXT NOT NULL,       -- requirement | signal | dataset | weights
  entity_id TEXT,
  action TEXT NOT NULL,
  field TEXT,
  before TEXT,
  after TEXT,
  rationale TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL              -- JSON
);
"""

PIPELINE_TABLES = [
    "vehicles", "feedback", "feedback_labels", "survey_scores", "sales", "equipment", "equipment_matches",
    "data_issues", "representation", "market_conflicts", "signals", "signal_evidence",
    "requirements", "audit_events", "settings",
]


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.executescript(SCHEMA)
    return con


def reset(con: sqlite3.Connection) -> None:
    """Drop and recreate every table, so schema changes apply on the next build.
    Dropping (not deleting the file) keeps a running web app connected to the same database."""
    for t in PIPELINE_TABLES:
        con.execute(f"DROP TABLE IF EXISTS {t}")
    con.executescript(SCHEMA)
    con.commit()


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def audit(con, *, actor_type, actor, entity_type, entity_id=None, action, field=None,
          before=None, after=None, rationale=None, region=None) -> None:
    con.execute(
        "INSERT INTO audit_events (ts, actor_type, actor, region, entity_type, entity_id, action, field, before, after, rationale)"
        " VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        (now(), actor_type, actor, region, entity_type, entity_id, action, field,
         None if before is None else str(before), None if after is None else str(after), rationale),
    )


def issue(con, dataset, severity, description, handling, vehicle=None) -> None:
    con.execute(
        "INSERT INTO data_issues (dataset, vehicle, severity, description, handling) VALUES (?,?,?,?,?)",
        (dataset, vehicle, severity, description, handling),
    )


def dumps(x) -> str:
    return json.dumps(x, ensure_ascii=False)
