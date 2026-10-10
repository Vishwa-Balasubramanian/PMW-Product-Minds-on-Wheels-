"""Step 3 - Triangulate. Cross-check signals with the customer studies, sales and equipment.

Also computes the two vehicle-level views: missing voices (representation) and market conflicts.
Owner: Arjun. Next: extend TOPIC_TO_SURVEY, match equipment (Trickle-Down Finder), web evidence.
"""
from __future__ import annotations

from .config import MARKETS
from .themes import member_topics
from . import db

# English customer language to German option-list wording. Terms are intentionally
# explicit: feature wording must occur in both the comment and the equipment row,
# and the comment's label must name an allowed topic with the appropriate intent.
EQUIPMENT_GLOSSARY = {
    "ventilated front seats": {
        "customer_terms": ("ventilat", "front cooling", "cooled seats", "seat coolers", "sitzbelüftung", "sitzbelueftung"),
        "equipment_terms": ("sitzbelüftung", "sitzbelueftung"),
        "topics": {"Seating, ventilate / heat", "Seats", "Vehicle, climatization", "Cooling"},
    },
    "comfort access": {
        "customer_terms": ("comfort access", "keyless", "komfortzugang"),
        "equipment_terms": ("komfortzugang",),
        "topics": {"Comfort Access", "Vehicle, lock / unlock", "Digital Key"},
    },
    "multi-contour seats": {
        "customer_terms": ("multi-contour", "multi contour", "multicontour", "multifunktionssitze"),
        "equipment_terms": ("multifunktionssitze",),
        "topics": {"Seats", "Seat memory", "Adjustment of lower lumbar support"},
    },
    "surround view": {
        "customer_terms": ("surround view", "surround-view", "around view"),
        "equipment_terms": ("surround view",),
        "topics": {"Surround View", "All-round view"},
    },
    "wireless charging": {
        "customer_terms": ("wireless charging", "wireless charger", "induktive lade"),
        "equipment_terms": ("wireless charging ablage", "induktive lade"),
        "topics": {"Mobile device, wireless charging"},
    },
    "massage seats": {
        "customer_terms": ("massage",), "equipment_terms": ("massage",), "topics": {"Seat massage"},
    },
    "heated steering wheel": {
        "customer_terms": ("heated steering wheel", "lenkradheizung"), "equipment_terms": ("lenkradheizung",),
        "topics": {"Heated steering wheel", "Steering wheel"},
    },
    "head-up display": {
        "customer_terms": ("head-up display", "head up display"), "equipment_terms": ("head-up display",),
        "topics": {"Head-Up Display"},
    },
    "sun blinds": {
        "customer_terms": ("sun blind", "sunblind", "sonnenschutzrollo"), "equipment_terms": ("sonnenschutzrollo",),
        "topics": {"Sun protection", "Sun visor, front"},
    },
    "ambient lighting": {
        "customer_terms": ("ambient light", "ambientes licht"), "equipment_terms": ("ambientes licht",),
        "topics": {"Ambient light", "Vehicle interior, lighting"},
    },
}


def build_equipment_matches(con, vehicle: str) -> None:
    """Link only literal bilingual comment/equipment matches, retaining IDs and source rows."""
    con.execute("DELETE FROM equipment_matches WHERE vehicle = ?", (vehicle,))
    sigs = con.execute("SELECT id, topic FROM signals WHERE vehicle = ? AND in_scope = 1", (vehicle,)).fetchall()
    rows = con.execute("SELECT * FROM equipment WHERE vehicle=?", (vehicle,)).fetchall()
    other_rows = con.execute("SELECT * FROM equipment WHERE vehicle<>? AND availability='standard'", (vehicle,)).fetchall()
    for sig in sigs:
        topics = member_topics(sig['topic'])
        feedback = con.execute(
            "SELECT DISTINCT f.id, f.text, l.topic, l.feedback_type FROM feedback f JOIN feedback_labels l ON l.feedback_id=f.id "
            f"WHERE f.vehicle=? AND l.topic IN ({','.join('?' for _ in topics)}) "
            "AND l.feedback_type IN ('Wants','Difficult to Use','Defect')",
            (vehicle, *topics)).fetchall()
        if not feedback:
            continue
        for feature, rule in EQUIPMENT_GLOSSARY.items():
            if not rule["topics"].intersection(topics):
                continue
            hits = [f for f in feedback if f["topic"] in rule["topics"]
                    and any(t in f["text"].casefold() for t in rule["customer_terms"])]
            if not hits:
                continue
            pending = {}
            wishes = [f for f in hits if f["feedback_type"] == "Wants"]
            problems = [f for f in hits if f["feedback_type"] in ("Difficult to Use", "Defect")]
            standard_here = False
            for row in rows:
                name = (row["name"] or "").casefold()
                if not any(t in name for t in rule["equipment_terms"]):
                    continue
                standard_here |= row["availability"] == "standard"
                name_clean = row["name"].lstrip("–- ").strip()
                item_code, item_price = row["code"], row["price_eur"]
                package_note = ""
                if row["availability"] == "package_item" and row["package"]:
                    parent = con.execute("SELECT name,code,price_eur FROM equipment WHERE vehicle=? AND lower(name)=lower(?) "
                                         "AND code IS NOT NULL ORDER BY price_eur DESC LIMIT 1", (vehicle, row["package"])).fetchone()
                    if parent:
                        item_code, item_price = parent["code"], parent["price_eur"]
                        price_note = f", €{parent['price_eur']:,.0f}" if parent["price_eur"] is not None else ""
                        package_note = f" Package: {parent['name']} ({parent['code']}{price_note})."
                # Offers must link to an identified option or parent package.
                if row["availability"] in ("optional", "package_item") and wishes and item_code:
                    match_type = "package_same_vehicle" if row["availability"] == "package_item" else "option_same_vehicle"
                    note = f"Customer wording '{feature}' matches the German equipment row '{name_clean}'.{package_note} Price list: Germany, July 2026."
                    key = (match_type, name_clean, item_code, item_price, vehicle)
                    pending.setdefault(key, {"ids": set(), "note": note})["ids"].update(f["id"] for f in wishes)
                if row["availability"] == "standard" and problems:
                    note = f"Customers report a problem with standard '{name_clean}'. Price list: Germany, July 2026."
                    key = ("standard_but_failing", name_clean, item_code, item_price, vehicle)
                    pending.setdefault(key, {"ids": set(), "note": note})["ids"].update(f["id"] for f in problems)
            # A feature already standard here is not a trickle-down opportunity.
            for other in other_rows:
                name = (other["name"] or "").casefold()
                if wishes and not standard_here and any(t in name for t in rule["equipment_terms"]):
                    name_clean = other["name"].lstrip("–- ").strip()
                    key = ("standard_other_vehicle", name_clean, other["code"], other["price_eur"], other["vehicle"])
                    pending.setdefault(key, {"ids": set(), "note":
                        f"{name_clean} is marked standard on {other['vehicle']} in its German price list."})["ids"].update(f["id"] for f in wishes)
            for (match_type, name, option_code, price, source_vehicle), values in pending.items():
                ids = sorted(values["ids"])
                con.execute("INSERT INTO equipment_matches VALUES (?,?,?,?,?,?,?,?,?,?)",
                            (vehicle, sig["id"], feature, match_type, name, option_code, price, source_vehicle,
                             db.dumps(ids), values["note"]))
                db.audit(con, actor_type="system", actor="Pipeline", entity_type="signal", entity_id=sig["id"],
                         action="matched customer evidence to equipment", after=f"{match_type}: {name}",
                         rationale=f"Comment IDs: {', '.join(ids)}; source equipment row retained in equipment.raw")

# BMW topic (taxonomy level 2) -> survey attributes. Prefix match, case-insensitive.
# "us" = US_2025 questions, "cneu" = CN_EU_2025 attributes.
TOPIC_TO_SURVEY: dict[str, dict[str, list[str]]] = {
    "Operating concept, operating system": {
        "us": ["Intuitiveness of controls", "Menu structure of infotainment system", "Placement/ ease of reading"],
        "cneu": ["Easy to read and use instruments", "Easy to use information and entertainment"]},
    "Touch screen, operation": {
        "us": ["Ease of reading and using screen interface", "Menu structure of infotainment system"],
        "cneu": ["Easy to use information and entertainment"]},
    "Vehicle, climatization": {
        "us": ["Overall performance of climate control system", "Operation of heater/ AC controls", "Air conditioner performance"],
        "cneu": ["Heating/ ventilation/ air conditioning"]},
    "Air conditioning, setting": {
        "us": ["Operation of heater/ AC controls"], "cneu": ["Heating/ ventilation/ air conditioning"]},
    "Air conditioning control panel": {
        "us": ["Operation of heater/ AC controls"], "cneu": ["Heating/ ventilation/ air conditioning"]},
    "Personal eSIM": {"us": ["WiFi hotspot in vehicle"], "cneu": ["Connected services"]},
    "ConnectedDrive and Infotainment, overall technology": {
        "us": ["Overall driver-vehicle interaction"], "cneu": ["Connected services", "Features of information and entertainment"]},
    "My BMW App / MINI App": {"us": ["Vehicle's Mobile App"], "cneu": ["Connected services"]},
    "Remote Services & Remote Keyless Entry (My BMW App/MINI App)": {"us": ["Vehicle's Mobile App"], "cneu": ["Connected services"]},
    "Apple CarPlay": {"us": ["Mirroring of smartphone content", "Bluetooth/ smartphone pairing"],
                      "cneu": ["Smartphone integration/ connectivity"]},
    "Mobile device, wireless charging": {"us": ["Phone charging", "Place for phone"], "cneu": ["Smartphone integration/ connectivity"]},
    "Seats": {"us": ["Overall comfort of the seats", "Comfort of front seat", "Comfort of 2nd row seat"],
              "cneu": ["Overall seating comfort"]},
    "Space / spatial impression": {"us": ["Interior roominess", "2nd row seat roominess"],
                                   "cneu": ["Rear interior roominess", "Front interior roominess"]},
    "Electric Range": {"us": ["Gas or electric mileage"], "cneu": ["Fuel economy/ energy efficiency"]},
    "Handling / Riding": {"us": ["Riding comfort", "Handling/Maneuverability"], "cneu": ["Quality of ride", "Roadholding"]},
    "Cushioning / damping vehicle": {"us": ["Riding comfort"], "cneu": ["Quality of ride"]},
    "Interior design": {"us": ["Overall interior styling"], "cneu": ["Interior styling"]},
    "Exterior design": {"us": ["Overall exterior styling"], "cneu": ["Exterior styling"]},
    "Audio mode, sound": {"us": ["Overall performance of sound system"], "cneu": []},
    "Navigation": {"us": ["If applicable: Navigation system"], "cneu": ["Integrated navigation system"]},
    "Ambient light": {"us": ["Interior lighting"], "cneu": []},
    "Panorama glass roof": {"us": ["If applicable: Sunroof"], "cneu": []},
    "Interior acoustics": {"us": ["Freedom from wind and road noise"], "cneu": ["Quietness when driving"]},
    "Highway assistant": {"us": ["Adaptive driving assists"], "cneu": []},
    "Driver assistance, automated driving, overall technology": {"us": ["Overall driver assist features"], "cneu": []},
    "Drivetrain": {"us": ["Overall power and pickup"], "cneu": ["Acceleration"]},
    "Braking": {"us": ["Braking"], "cneu": ["Braking"]},
    "Luggage compartment": {"us": ["Cargo capacity/usefulness"], "cneu": ["Luggage capacity", "Ease of loading"]},
    "Storage compartments": {"us": ["Interior storage"], "cneu": ["Interior storage for small items"]},
    "Center console, front": {"us": ["Interior storage"], "cneu": ["Interior storage for small items"]},
    "Wheels / tires": {"us": ["Appearance of tires/ wheels"], "cneu": []},
    "Intelligent Personal Assistant": {"us": ["Performance of voice recognition"], "cneu": []},
    "Rear seat entertainment": {"us": [], "cneu": ["Rear interior roominess"]},
    "Automatic doors": {"us": ["Ease of front seat entry"], "cneu": ["Ease of entry into and out of car"]},
    "Instrument cluster": {"us": ["Instrument panel"], "cneu": ["Easy to read and use instruments"]},
}


def survey_gap(row) -> float:
    """0 = customers happy, 1 = clear dissatisfaction. Same meaning for both study types."""
    if row["scale"] == 7:
        return max(0.0, min(1.0, (row["bottom3"] or 0) / 0.25))
    return max(0.0, min(1.0, (9.0 - row["mean"]) / 2.0))


def survey_for_topic(con, vehicle: str, topic: str) -> list[dict]:
    members = member_topics(topic)
    if members != (topic,):
        # Union every member's mappings; overlapping survey questions count once.
        unique = {}
        for member in members:
            for row in survey_for_topic(con, vehicle, member):
                unique[(row['market'], row['study'], row['attribute'], row['variant'])] = row
        return [unique[key] for key in sorted(unique, key=str)]
    m = TOPIC_TO_SURVEY.get(topic)
    if not m:
        return []
    out = []
    for study, prefixes in (("US_2025", m.get("us", [])), ("CN_EU_2025", m.get("cneu", []))):
        for p in prefixes:
            rows = con.execute(
                "SELECT * FROM survey_scores WHERE vehicle = ? AND study = ? AND lower(attribute) LIKE ? AND in_scope = 1",
                (vehicle, study, p.lower() + "%")).fetchall()
            for r in rows:
                out.append({"market": r["market"], "variant": r["variant"], "study": study, "attribute": r["attribute"],
                            "mean": round(r["mean"], 2), "scale": r["scale"],
                            "bottom3": None if r["bottom3"] is None else round(r["bottom3"], 3),
                            "top2": None if r["top2"] is None else round(r["top2"], 3),
                            "gap": round(survey_gap(r), 2)})
    return out


def sales_shares(con, vehicle: str, year: int) -> dict[str, float]:
    rows = con.execute("SELECT market, volume FROM sales WHERE vehicle = ? AND year = ?", (vehicle, year)).fetchall()
    total = sum(r["volume"] for r in rows) or 1
    return {r["market"]: r["volume"] / total for r in rows}


def build_representation(con, vehicle: str) -> None:
    fb = dict(con.execute("SELECT market, COUNT(*) FROM feedback WHERE vehicle = ? GROUP BY market", (vehicle,)).fetchall())
    total_fb = sum(fb.values()) or 1
    s25 = dict(con.execute("SELECT market, volume FROM sales WHERE vehicle = ? AND year = 2025", (vehicle,)).fetchall())
    s30 = dict(con.execute("SELECT market, volume FROM sales WHERE vehicle = ? AND year = 2030", (vehicle,)).fetchall())
    total_s = sum(s25.values()) or 1
    for mk in MARKETS:
        con.execute("INSERT INTO representation VALUES (?,?,?,?,?,?,?)",
                    (vehicle, mk, fb.get(mk, 0), fb.get(mk, 0) / total_fb, s25.get(mk, 0), s25.get(mk, 0) / total_s,
                     s30.get(mk, 0)))


def build_conflicts(con, vehicle: str, threshold: float = 0.8) -> None:
    rows = con.execute("SELECT attribute, market, mean, in_scope, scope_reason FROM survey_scores "
                       "WHERE vehicle = ? AND study = 'CN_EU_2025'", (vehicle,)).fetchall()
    by_attr: dict[str, dict] = {}
    for r in rows:
        by_attr.setdefault(r["attribute"], {"in_scope": r["in_scope"], "why": r["scope_reason"]})[r["market"]] = r["mean"]
    for attr, d in by_attr.items():
        if "CN" in d and "EU" in d and abs(d["CN"] - d["EU"]) >= threshold:
            con.execute("INSERT INTO market_conflicts VALUES (?,?,?,?,?,?,?)",
                        (vehicle, attr, round(d["CN"], 2), round(d["EU"], 2), round(d["CN"] - d["EU"], 2),
                         d["in_scope"], d["why"]))


def conflicts_for(con, vehicle: str, survey_rows: list[dict]) -> list[dict]:
    attrs = {r["attribute"] for r in survey_rows if r["study"] == "CN_EU_2025"}
    if not attrs:
        return []
    rows = con.execute("SELECT * FROM market_conflicts WHERE vehicle = ? AND in_scope = 1", (vehicle,)).fetchall()
    return [dict(r) for r in rows if r["attribute"] in attrs]
