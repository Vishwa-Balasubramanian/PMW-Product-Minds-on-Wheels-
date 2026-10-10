"""Step 4 - Derive. Turn a signal into a requirement via the ladder:
customer voice -> signal -> root cause -> customer need -> requirement.

Two modes:
- template (default, no API key): honest placeholders, clearly marked "pending AI analysis".
- llm (--llm and ANTHROPIC_API_KEY set): the LLM writes root cause, need, requirement, assumptions.
  Results are cached in pipeline/cache/ and committed, so teammates without a key get the same drafts.

Owner: Vishwa. Improve the prompt, keep the JSON contract.
"""
from __future__ import annotations

import hashlib
import json
import os
import re

from .config import CACHE, MODEL, VEHICLES

TITLE_BY_ISSUE = {
    "Not user-friendly": "Easy-to-use {t}",
    "Size not user friendly": "Right-sized {t}",
    "Malfunction": "Reliable {t}",
    "Damage": "Durable {t}",
    "Noise": "Quieter {t}",
    "Customer request: function": "{T}: the functions customers ask for",
    "Customer request: usability": "Simpler {t} handling",
    "Customer request: design": "{T}: the design customers ask for",
    "Range, not OK": "Electric range customers can rely on",
    "insufficient storage space": "More usable storage",
    "Information / accuracy insufficient": "Accurate information from the {t}",
}

# Readable names for BMW taxonomy topics. Extend as new topics show up.
TOPIC_NAMES = {
    "Vehicle, climatization": "climate control",
    "Air conditioning, setting": "climate settings",
    "Air conditioning control panel": "climate control panel",
    "Operating concept, operating system": "operating concept",
    "Touch screen, operation": "touchscreen",
    "My BMW App / MINI App": "My BMW App",
    "Remote Services & Remote Keyless Entry (My BMW App/MINI App)": "remote services",
    "ConnectedDrive and Infotainment, overall technology": "connected services and infotainment",
    "Drive, driving dynamics and chassis, overall technology": "driving dynamics",
    "Driver assistance, automated driving, overall technology": "driver assistance",
    "Door, open and close": "door opening and closing",
    "My Modes / driving experience": "My Modes",
    "Handling / Riding": "handling and ride",
    "Space / spatial impression": "interior space",
    "Mobile device, wireless charging": "wireless phone charging",
    "Public charging / external providers": "public charging",
    "Center console, front": "front centre console",
    "Wheels / tires": "wheels and tyres",
    "Audio mode, sound": "audio",
    "Personal eSIM": "personal eSIM",
    "Apple CarPlay": "Apple CarPlay",
}


def _topic_human(topic: str) -> str:
    if topic in TOPIC_NAMES:
        return TOPIC_NAMES[topic]
    t = re.sub(r",? overall technology", "", topic)
    t = t.replace(" / ", " and ").replace("/", " and ").replace(", ", " ")
    return t.strip().lower()


def template(signal: dict, quotes: list[dict], vehicle: str) -> dict:
    t = _topic_human(signal["topic"])
    pattern = TITLE_BY_ISSUE.get(signal["dominant_issue"] or "", "Better {t}")
    title = pattern.format(T=t[:1].upper() + t[1:], t=t)
    title = title[:1].upper() + title[1:]
    voice = quotes[0] if quotes else None
    short = VEHICLES[vehicle]["short"]
    return {
        "title": title,
        "customer_voice": f"“{voice['text'][:260]}” ({voice['id']})" if voice else None,
        "root_cause": None,
        "customer_need": None,
        "requirement": f"The successor {short} resolves what customers report about {t}: "
                       f"{(signal['dominant_issue'] or 'mixed issues').lower()} is the most common complaint. "
                       f"(Template draft. Run the AI step to write the final requirement.)",
        "future_lens": None,
        "assumptions": [],
        "uncertainties": [],
        "generated_by": "template",
    }


PROMPT = """You are helping a BMW product manager define customer-facing requirements for the successor of the {vehicle}.
Scope: customer-facing product requirements only. Never propose regulatory, engineering-spec or pricing requirements.

Signal: {topic}
- {n_comments} customer comments, {n_negative} negative ({n_hard} hard to use, {n_defect} defects, {n_wants} wishes), {n_likes} positive.
- Most common issue label: {dominant}
- Comments by market: {by_market}
Survey evidence (US: share of the three lowest answers; CN/EU: mean on 1-10):
{survey}
Customer comments (negative, most severe first):
{neg}
Customer comments that praise this topic:
{pos}

Return only JSON with these keys:
{{"title": "max 9 words, customer-facing, no jargon",
  "root_cause": "why customers experience this, grounded in the comments, 1-2 sentences",
  "customer_need": "what the customer actually needs, 1 sentence, starts with 'Drivers' or 'Passengers' or 'Owners'",
  "requirement": "clear, actionable, customer-facing requirement for the successor vehicle, 1-2 sentences, testable",
  "future_lens": "current_pain | emerging | future_must_have",
  "assumptions": ["forward-looking assumptions about 3-5 years ahead, each one sentence"],
  "uncertainties": ["what could make this wrong, each one sentence"]}}
Quote comment IDs in root_cause where useful. Do not invent numbers."""


def _cache_path(vehicle: str, topic: str):
    h = hashlib.sha1(f"{vehicle}|{topic}".encode()).hexdigest()[:10]
    return CACHE / f"derive_{vehicle}_{h}.json"


def llm(signal: dict, quotes: list[dict], likes: list[dict], survey: list[dict], vehicle: str) -> dict | None:
    path = _cache_path(vehicle, signal["topic"])
    if path.exists():
        return json.loads(path.read_text())
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return None
    import anthropic  # optional dependency: uv sync --extra llm

    surv = "\n".join(f"- {r['market']} {r['attribute']}: " + (f"{r['bottom3']:.0%} negative" if r["scale"] == 7 else f"mean {r['mean']}")
                     for r in survey) or "- none mapped"
    prompt = PROMPT.format(
        vehicle=VEHICLES[vehicle]["name"], topic=signal["topic"], n_comments=signal["n_comments"],
        n_negative=signal["n_negative"], n_hard=signal["n_hard_to_use"], n_defect=signal["n_defect"],
        n_wants=signal["n_wants"], n_likes=signal["n_likes"], dominant=signal["dominant_issue"],
        by_market=signal["by_market"], survey=surv,
        neg="\n".join(f"- [{q['id']}] {q['text'][:400]}" for q in quotes[:15]),
        pos="\n".join(f"- [{q['id']}] {q['text'][:200]}" for q in likes[:5]) or "- none")
    client = anthropic.Anthropic()
    msg = client.messages.create(model=MODEL, max_tokens=1200, messages=[{"role": "user", "content": prompt}])
    text = "".join(b.text for b in msg.content if b.type == "text")
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    data = json.loads(m.group(0))
    data["generated_by"] = f"llm:{MODEL}"
    CACHE.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    return data
