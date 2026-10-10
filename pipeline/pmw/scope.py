"""Scope guard. BMW scope: customer-facing product requirements only.

Out of scope (from the brief): regulatory/homologation, technical/engineering specs, pricing and business case.
Owner: Arjun. Extend the rules; every exclusion must carry a reason the PM can read.
"""
from __future__ import annotations

import re

# BMW taxonomy topics that never become requirements on their own.
OUT_OF_SCOPE_TOPICS = {
    "Automatic engine start-stop function (MSA)":
        "Regulatory: switching start-stop off permanently touches emissions homologation. "
        "Only the usability of its control could be raised separately.",
    "General enquiry: customer feedback": "Too generic to turn into a requirement.",
    "Owner's Manual": "Documentation, not a vehicle requirement. Track as a service topic.",
    "Body equipment, overall technology": "Catch-all label. Too broad to act on until the AI step splits it into themes.",
}

SURVEY_OUT_OF_SCOPE = [
    (r"value for money|price|afford|deal offered|resale|trade-in|cost of ownership|economical to own",
     "Pricing and business case are out of scope."),
    (r"warranty", "Warranty is a commercial term, not a product requirement."),
    (r"reputation|prestige|brand image|overall vehicle image", "Brand perception, not a product requirement."),
    (r"environm", "Environmental friendliness overlaps with regulation; treat as context only."),
    (r"^overall product satisfaction$", "Overall satisfaction is an outcome, not an actionable requirement."),
]

TEXT_OUT_OF_SCOPE = [
    (re.compile(r"\b(emission|homologat|type approval|recall)\w*", re.I), "Regulatory topic"),
    (re.compile(r"\b(lease|financing|price increase|msrp|discount)\b", re.I), "Pricing topic"),
]


def topic_scope(topic: str) -> tuple[bool, str | None]:
    if topic in OUT_OF_SCOPE_TOPICS:
        return False, OUT_OF_SCOPE_TOPICS[topic]
    return True, None


def survey_attribute_scope(attribute: str) -> tuple[bool, str | None]:
    a = attribute.strip().lower()
    for pattern, reason in SURVEY_OUT_OF_SCOPE:
        if re.search(pattern, a):
            return False, reason
    return True, None


def text_scope(text: str) -> tuple[bool, str | None]:
    for rx, reason in TEXT_OUT_OF_SCOPE:
        if rx.search(text or ""):
            return False, reason
    return True, None
