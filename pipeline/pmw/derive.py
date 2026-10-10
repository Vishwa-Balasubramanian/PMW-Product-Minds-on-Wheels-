"""Evidence-grounded requirements with validated AI and honest offline drafts."""
from __future__ import annotations

import re

from . import ai, drafts
from .config import MODEL, VEHICLES

FIELDS = {"title", "root_cause", "customer_need", "requirement", "future_lens", "assumptions", "uncertainties"}
LENSES = ("current_pain", "emerging", "future_must_have")
SCHEMA = ai.object_schema({
    **{k: {"type": "string"} for k in ("title", "root_cause", "customer_need", "requirement")},
    "future_lens": {"type": "string", "enum": list(LENSES)},
    "assumptions": {"type": "array", "items": {"type": "string"}},
    "uncertainties": {"type": "array", "items": {"type": "string"}},
})
PROMPT = """Draft a customer-facing requirement for the successor vehicle from the
supplied evidence. Title: at most nine words, plain language, no BMW jargon.
Root cause: explicitly a working hypothesis, with at least one supplied supporting
comment ID. Never claim the comments prove a technical cause. Customer need:
one sentence beginning Drivers, Passengers or Owners. Requirement: one or two
observable, testable customer-outcome sentences for the successor vehicle.
No pricing, regulations, engineering specifications or invented numerical targets.
Do not quote raw customer text. Address positive evidence and conflicting surveys
in uncertainties; do not infer missing-market opinions. Assumptions must identify
a concrete successor-planning dependency, not state future trends as facts.
Choose current_pain, emerging or future_must_have and justify future claims as
assumptions. Numbers, scores and population estimates are forbidden.
Return exactly the schema with nonempty assumptions and uncertainties."""


def validate(data: dict, allowed_ids: set[str]) -> None:
    if not isinstance(data, dict) or set(data) != FIELDS:
        raise ValueError("Unexpected or missing requirement fields")
    for key in ("title", "root_cause", "customer_need", "requirement"):
        ai.validate_prose(data[key], allowed_ids, citations=key == "root_cause")
    if len(data["title"].split()) > 9:
        raise ValueError("Title exceeds nine words")
    if re.search(r"BMW|ConnectedDrive|iDrive|eSIM|My Modes", data["title"], re.I):
        raise ValueError("Title contains brand jargon")
    if not re.match(r"^(Drivers|Passengers|Owners)\b", data["customer_need"]):
        raise ValueError("Customer need must start with the customer")
    if not re.search(r"hypothes|may |might |could ", data["root_cause"], re.I):
        raise ValueError("Root cause must be framed as an unverified hypothesis")
    sentences = [s for s in re.split(r"(?<=[.!?])\s+", data["requirement"].strip()) if s]
    if not 1 <= len(sentences) <= 2 or "successor" not in data["requirement"].lower():
        raise ValueError("Expected one or two successor requirement sentences")
    if re.search(r"\b(homologation|msrp|discount|horsepower|kilowatts|torque|emissions limit)\b", data["requirement"], re.I):
        raise ValueError("Requirement exceeds customer-facing scope")
    if data["future_lens"] not in LENSES:
        raise ValueError("Unknown future lens")
    for key in ("assumptions", "uncertainties"):
        if not isinstance(data[key], list) or not 1 <= len(data[key]) <= 6:
            raise ValueError("Expected a nonempty bounded list")
        for value in data[key]:
            ai.validate_prose(value, allowed_ids)


def template(signal: dict, quotes: list[dict], vehicle: str) -> dict:
    data = drafts.make(signal, quotes)
    if quotes:
        validate({k: data[k] for k in FIELDS}, {q["id"] for q in quotes})
    voice = quotes[0] if quotes else None
    data["customer_voice"] = f"“{voice['text'][:260]}” ({voice['id']})" if voice else None
    return data


def generate(signal: dict, quotes: list[dict], likes: list[dict], survey: list[dict], vehicle: str) -> ai.Result:
    negative, positive = quotes[:15], likes[:5]
    allowed = {q["id"] for q in negative + positive}
    return ai.run_json(task="derive", model=MODEL, instruction=PROMPT,
                       payload={"vehicle": VEHICLES[vehicle]["name"], "topic": signal["topic"],
                                "dominant_issue": signal["dominant_issue"],
                                "supporting_comments": negative, "positive_comments": positive,
                                "survey": survey, "market_counts": signal["by_market"]},
                       schema=SCHEMA, validate=lambda data: validate(data, allowed))


def llm(signal: dict, quotes: list[dict], likes: list[dict], survey: list[dict], vehicle: str) -> dict | None:
    """Compatibility entry point; CLI uses generate() to retain audit metadata."""
    result = generate(signal, quotes, likes, survey, vehicle)
    return {**result.data, "generated_by": result.source} if result.data else None
