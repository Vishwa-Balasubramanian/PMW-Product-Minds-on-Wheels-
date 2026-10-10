"""Paths, vehicles, markets. One place to change when adding a vehicle or market."""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
# The BMW files live in data/ in the repo. data/raw/ (git-ignored) still works for local copies.
RAW = next((p for p in (ROOT / "data" / "raw", ROOT / "data") if (p / "sales_volumes.xlsx").exists()), ROOT / "data")
DB_PATH = Path(os.environ.get("PMW_DB", ROOT / "db" / "pmw.sqlite"))
CACHE = ROOT / "pipeline" / "cache"

# Default model for AI steps (override with PMW_MODEL).
MODEL = os.environ.get("PMW_MODEL", "claude-opus-5-5")

VEHICLES: dict[str, dict] = {
    "F70": {
        "name": "BMW 1 Series",
        "short": "1 Series",
        "feedback_file": "F70_feedback_hackathon.xlsx",
        "sales_sheet": "F70",
        "options_file": "F70_OptionList.PDF",
        "image": "/cars/F70.jpg",
    },
    "G60": {
        "name": "BMW 5 Series",
        "short": "5 Series",
        "feedback_file": "G60_feedback_hackathon.xlsx",
        "sales_sheet": "G60_G68",
        "options_file": "G60_OptionList.PDF",
        "image": "/cars/G60.jpg",
    },
    "G70": {
        "name": "BMW 7 Series",
        "short": "7 Series",
        "feedback_file": "G70_feedback_hackathon.xlsx",
        "sales_sheet": "G70",
        "options_file": "G70_OptionList.PDF",
        "image": "/cars/G70.jpg",
    },
}

STUDY_FILE = "F70_G60_G68_G70_customer_studies.xlsx"
SALES_FILE = "sales_volumes.xlsx"

MARKETS = ["US", "EU", "CN", "ROW"]
MARKET_NAMES = {"US": "United States", "EU": "Europe", "CN": "China", "ROW": "Rest of World"}

EU_COUNTRIES = {
    "GB", "SE", "FR", "DK", "FI", "NO", "LV", "ES", "DE", "IT", "NL", "BE", "AT", "CH", "IE",
    "PT", "PL", "CZ", "HU", "GR", "LT", "EE", "SK", "SI", "LU", "IS",
}


def country_to_market(country: str | None) -> str:
    if not country:
        return "ROW"
    c = country.strip().upper()
    if c == "US":
        return "US"
    if c == "CN":
        return "CN"
    if c in EU_COUNTRIES:
        return "EU"
    return "ROW"


SOURCE_NAMES = {
    "Source A": "Owner review",
    "Source B": "Dealer note",
    "Source C": "Quality survey",
    "Source D": "Open survey answer",
}

POWERTRAIN = {"ICE": "Combustion", "BEVE": "Electric", "PHEV": "Plug-in hybrid"}
