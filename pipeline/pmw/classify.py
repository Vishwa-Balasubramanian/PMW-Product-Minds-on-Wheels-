"""Conservative offline labels and optional validated batch classification.

Rules are deliberately separate from AI provenance. Generic praise, commercial
complaints and ambiguous sentiment abstain. BMW's original labels are immutable.
"""
from __future__ import annotations

import re

from . import ai
from .config import MODEL_FAST
from .scope import text_scope

TYPES = ("Likes", "Difficult to Use", "Defect", "Wants")
RULE_VERSION = "lexical-v1"
# Specific terms only; no bare "car", "system", "power" or "good" topic matches.
RULES = {
    "Seats": r"\bseats?\b|head\s?rests?|lumbar",
    "Touch screen, operation": r"touch\s?screen|screen interface|touch display|sub.?menus?",
    "Operating concept, operating system": r"user interface|physical buttons?|control buttons?|menu structure",
    "Apple CarPlay": r"car\s?play|android auto",
    "Personal eSIM": r"\besim\b|wi.?fi hotspot",
    "My BMW App / MINI App": r"my bmw app|smartphone app|mobile app|bmw app",
    "ConnectedDrive and Infotainment, overall technology": r"infotainment|\bidrive\b|connecteddrive",
    "Vehicle, climatization": r"air condition|climate control|\baircon\b|\bac\b|cabin cool|air vents?",
    "Navigation": r"navigation|\bgps\b|route guidance",
    "Electric Range": r"electric range|battery range|mileage range|range (?:display|estimate)|range anxiety",
    "Public charging / external providers": r"charging stations?|charging network|public charg",
    "Charge high-voltage battery": r"charging speed|charging rate|battery charg|charge the battery",
    "Mobile device, wireless charging": r"wireless charg|charging pad|phone charg",
    "Audio mode, sound": r"sound system|audio system|\bspeakers?\b|music quality|stereo",
    "Interior acoustics": r"wind noise|road noise|cabin noise|quiet cabin",
    "Braking": r"\bbrakes?\b|\bbraking\b|brake pedal",
    "Handling / Riding": r"ride comfort|smooth ride|driving feel|\bhandling\b|cornering|hugs the road",
    "Cushioning / damping vehicle": r"\bsuspension\b|\bdamping\b",
    "Exterior design": r"exterior (?:design|styling)|body shape|front grille|elegant appearance|visible tailpipes",
    "Interior design": r"interior (?:design|styling)|cabin design|interior materials",
    "Vehicle key": r"\bkey fob\b|digital key|car key",
    "Vehicle, lock / unlock": r"door locks?|\bunlock\w*\b|locking",
    "Automatic doors": r"automatic doors?|auto(?:matic)? open",
    "Door, open / close": r"door handles?|door opening|doors? (?:creak|open|close)",
    "Luggage compartment": r"\btrunk\b|luggage|boot space",
    "Storage compartments": r"\bstorage\b|cup\s?holders?",
    "Panorama glass roof": r"sunroof|glass roof|panoramic roof|roof shade",
    "My Modes / driving experience": r"driving modes?|efficient mode|sport mode|my modes",
    "USB port": r"\busb\b",
    "Instrument cluster": r"instrument (?:cluster|display|panel)|dash display|speedometer|gauges",
    "Exterior rearview mirror": r"side mirror|door mirror|rearview mirror|parking mirror",
    "Wheels / tires": r"\btires?\b|\btyres?\b|(?<!steering )\bwheels?\b",
    "Heated steering wheel": r"heated steering wheel|steering wheel heat",
    "Transmission": r"gearbox|transmission|gear selector|gear shift",
}
PATTERNS = {topic: re.compile(pattern, re.I) for topic, pattern in RULES.items()}
QUESTION_TOPICS = {
    'exterior styling': 'Exterior design', 'infotainment system': 'ConnectedDrive and Infotainment, overall technology',
    'engine/motor': 'Drivetrain', 'driving feel': 'Handling / Riding',
    'driving comfort': 'Interior comfort', 'getting in/out': 'Door, open / close',
    'interior of': 'Interior design',
}


def _type(text: str) -> str | None:
    t = text.casefold()
    if re.search(r"\b(?:no|without) (?:problems?|issues?)\b|works? (?:well|perfectly)", t):
        return "Likes"
    if re.search(r"not work|doesn.t work|won.t work|stopped working|broken|malfunction|\bfailed?\b|\bcreak\w*|disconnect|goes blank", t):
        return "Defect"
    if re.search(r"difficult|confus|complicated|awkward|hard to|unintuitive|not intuitive|unusable|too many|too (?:short|small|firm|far)|uncomfortable", t):
        return "Difficult to Use"
    if re.search(r"\bwish\b|would like|would prefer|please (?:add|make|improve)|should (?:have|be|offer)|could be (?:better|improved)|most improved|\bwant\b", t):
        return "Wants"
    if re.search(r"\blove\b|\blike\b|excellent|comfortable|pleased|enjoy|smooth|elegant|hugs the road", t):
        if not re.search(r"\bnot\b|\bdon.t\b|\bdislike\b|\bhate\b|\bbut\b", t):
            return "Likes"
    return None


def offline(text: str, topics: set[str]) -> list[dict]:
    # Open-survey prompts contain the word "negative"; discard the question.
    text = re.sub(r"^.*?\?\s*:\s*", "", text, count=1, flags=re.S)
    # Sentiment in the survey suffix applies to the preceding short answer.
    suffix = re.search(r"That is (?:the )?one thing .*", text, re.I)
    context = suffix.group(0).casefold() if suffix else ''
    inherited = 'Likes' if 'love most' in context else 'Wants' if 'most improved' in context else None
    answer = text[:suffix.start()] if suffix else text
    if re.fullmatch(r"[\s.\"']*(?:none|nothing|everything|n/?a|no comment)[\s.\"']*", answer, re.I):
        return []
    if re.fullmatch(r"[\s.\"']*(?:it is a bmw|it.s a bmw|great car|love (?:the|this) car)[\s.\"']*", answer, re.I):
        return []
    labels = {}
    for clause in re.split(r"[.!?;\n]+|\bbut\b|\bhowever\b", answer, flags=re.I):
        clause = clause.strip(' :"')
        if not clause or not text_scope(clause)[0]:
            continue
        kind = _type(clause)
        if not kind and not re.search(r"\bnot\b|\bdon.t\b|\bdislike\b|\bhate\b|\bbad\b|\bawful\b", clause, re.I):
            kind = inherited
        if not kind:
            continue
        for topic, pattern in PATTERNS.items():
            match = pattern.search(clause)
            if topic in topics and match:
                # Keep a literal grounding span, not an invented classification rationale.
                start = max(0, match.start() - 55)
                span = clause[start:min(len(clause), start + 180)]
                labels[(topic, kind)] = {"topic": topic, "feedback_type": kind, "evidence": span}
        if not labels and suffix and len(clause.split()) >= 2:
            # The question supplies the topic, but only the actual answer supplies
            # a claim. Empty/generic answers above still abstain.
            for hint, topic in QUESTION_TOPICS.items():
                if hint in context and topic in topics:
                    labels[(topic, kind)] = {"topic": topic, "feedback_type": kind, "evidence": clause[:180]}
                    break
    return list(labels.values())[:3]


PROMPT = """Classify every supplied comment using only the supplied existing topics
and four feedback types. Return an entry for every ID, in input order. A comment
may have up to three labels. Each label needs a short verbatim evidence span from
that comment. Use labels: [] for generic praise, insufficient evidence, commercial
or regulatory content, or when no topic fits. Handle negation and mixed sentiment
per topic. Do not infer a defect merely because a customer requests a feature.
Ignore questionnaire boilerplate when assessing sentiment. Never invent IDs or topics."""
SCHEMA = ai.object_schema({"comments": {"type": "array", "items": ai.object_schema({
    "id": {"type": "string"}, "labels": {"type": "array", "items": ai.object_schema({
        "topic": {"type": "string"}, "feedback_type": {"type": "string", "enum": list(TYPES)},
        "evidence": {"type": "string"}})}})}})


def validate_batch(data: dict, comments: list[dict], topics: set[str]) -> None:
    if not isinstance(data, dict) or set(data) != {"comments"} or not isinstance(data["comments"], list):
        raise ValueError("Expected comments array")
    expected = {c["id"]: c["text"] for c in comments}
    seen = set()
    for entry in data["comments"]:
        if not isinstance(entry, dict) or set(entry) != {"id", "labels"}:
            raise ValueError("Invalid classification keys")
        fid, labels = entry["id"], entry["labels"]
        if fid not in expected or fid in seen or not isinstance(labels, list) or len(labels) > 3:
            raise ValueError("Unknown/duplicate ID or too many labels")
        seen.add(fid)
        pairs = set()
        for label in labels:
            if not isinstance(label, dict) or set(label) != {"topic", "feedback_type", "evidence"}:
                raise ValueError("Invalid label keys")
            topic, kind, span = label["topic"], label["feedback_type"], label["evidence"]
            if topic not in topics or kind not in TYPES:
                raise ValueError("Unknown topic or feedback type")
            if not isinstance(span, str) or not 4 <= len(span.strip()) <= 240 or span.casefold() not in expected[fid].casefold():
                raise ValueError("Evidence span is not in the comment")
            if (topic, kind) in pairs:
                raise ValueError("Duplicate label")
            pairs.add((topic, kind))
    if seen != set(expected):
        raise ValueError("Missing comment IDs")


def batch(comments: list[dict], topics: set[str]) -> ai.Result:
    return ai.run_json(task="classify", model=MODEL_FAST, instruction=PROMPT,
                       payload={"comments": comments, "topics": sorted(topics), "feedback_types": TYPES},
                       schema=SCHEMA, validate=lambda data: validate_batch(data, comments, topics), max_tokens=6500)
