"""Which part of the car a requirement is about, and which photo shows it.

Each requirement gets: aspect (Cockpit, Interior, Exterior, Driving), part (e.g. "Gear selector"),
photo (web path) and a focal point (x, y in % of the photo) so the web app can crop to that part.
Owner: Arjun. Add rules and focal points as new topics or better photos come in.
"""
from __future__ import annotations

import re

# Photos per vehicle (files live in web/public/cars/<code>/<key>.jpg), with focal points per part.
# Coordinates are percentages of the photo: (x, y).
PHOTOS: dict[str, dict[str, dict[str, tuple[int, int]]]] = {
    "F70": {
        "cockpit": {"default": (60, 45), "display": (76, 36), "cluster": (55, 35), "steering": (22, 35), "climate": (75, 55),
                    "console": (62, 84), "gear": (40, 91), "seats": (8, 84)},
        "front": {"default": (45, 55), "grille": (10, 56), "headlight": (37, 53), "mirror": (68, 44), "door": (79, 47), "wheel": (55, 62)},
        "road": {"default": (50, 58), "wheel": (52, 66)},
        "white": {"default": (50, 60), "wheel": (50, 65), "brake": (51, 66), "headlight": (22, 55)},
        "rear": {"default": (55, 55), "boot": (62, 50), "taillight": (68, 52)},
    },
    "G60": {
        "cockpit": {"default": (55, 45), "display": (70, 40), "cluster": (45, 38), "steering": (15, 38), "climate": (60, 52),
                    "console": (50, 85), "gear": (50, 85)},
        "seats": {"default": (55, 55), "seats": (60, 60)},
        "front": {"default": (50, 66), "headlight": (85, 66), "wheel": (65, 72), "mirror": (58, 61), "door": (45, 64)},
        "grille": {"default": (50, 45), "grille": (50, 40)},
        "road": {"default": (50, 50), "wheel": (60, 65)},
    },
    "G70": {
        "cockpit": {"default": (55, 50), "display": (78, 45), "steering": (37, 45), "climate": (70, 30), "console": (55, 85),
                    "gear": (55, 85), "seats": (15, 80), "door": (8, 50), "cluster": (76, 31), "speaker": (18, 42)},
        "front": {"default": (51, 55), "grille": (51, 52), "headlight": (35, 49)},
        "detail": {"default": (50, 55), "headlight": (45, 52), "wheel": (95, 60), "grille": (8, 60)},
        "road": {"default": (45, 58), "wheel": (45, 65)},
        "rear": {"default": (50, 58), "boot": (50, 55), "taillight": (35, 52)},
    },
}

# Topic rules, first match wins: (pattern, aspect, part, [(photo, focal key), ...fallbacks]).
RULES: list[tuple[str, str, str, list[tuple[str, str]]]] = [
    # Specific customer parts must win over broad climate/interior keywords.
    (r"rear (?:seat )?entertainment", "Interior", "Rear entertainment", [("cockpit", "display")]),
    (r"roominess|cabin space|space / spatial", "Interior", "Cabin space", [("seats", "default"), ("cockpit", "seats")]),
    (r"seat", "Interior", "Seats", [("seats", "seats"), ("cockpit", "seats")]),
    (r"sun blind|sun protection|sun visor", "Interior", "Sun protection", [("road", "default")]),
    (r"ambient", "Interior", "Ambient lighting", [("cockpit", "default")]),
    (r"touch ?screen|operating concept|control display|idrive", "Cockpit", "Control display", [("cockpit", "display")]),
    (r"instrument cluster|head-up", "Cockpit", "Instrument cluster", [("cockpit", "cluster")]),
    (r"navigation", "Cockpit", "Navigation", [("cockpit", "display")]),
    (r"esim|connected|infotainment|app\b|remote|carplay|android", "Cockpit", "Connectivity", [("cockpit", "display")]),
    (r"intelligent personal assistant|voice", "Cockpit", "Voice assistant", [("cockpit", "display")]),
    (r"audio|sound|radio|speaker", "Cockpit", "Audio", [("cockpit", "speaker"), ("cockpit", "display")]),
    (r"climat|air condition|heating|ventilat", "Cockpit", "Climate control", [("cockpit", "climate")]),
    (r"steering wheel|horn", "Cockpit", "Steering wheel", [("cockpit", "steering")]),
    (r"transmission|gear", "Interior", "Gear selector", [("cockpit", "gear")]),
    (r"storage|console|usb|wireless charging|mobile device|cup", "Interior", "Centre console", [("cockpit", "console")]),
    (r"ambient|interior design|interior", "Interior", "Interior design", [("cockpit", "default")]),
    (r"space|rear seat|rear entertainment", "Interior", "Cabin space", [("seats", "default"), ("cockpit", "seats")]),
    (r"door|key|access|lock", "Exterior", "Doors and access", [("front", "door"), ("cockpit", "door")]),
    (r"mirror", "Exterior", "Door mirror", [("front", "mirror")]),
    (r"wheel|tyre|tire", "Exterior", "Wheels and tyres", [("white", "wheel"), ("detail", "wheel"), ("front", "wheel"), ("road", "wheel")]),
    (r"brak", "Driving", "Brakes", [("white", "brake"), ("detail", "wheel"), ("road", "wheel")]),
    (r"headlight|light", "Exterior", "Lighting", [("detail", "headlight"), ("front", "headlight")]),
    (r"luggage|trunk|tailgate|boot", "Exterior", "Boot", [("rear", "boot"), ("road", "default")]),
    (r"assistance|highway|parking|camera|surround view|sensor|blind spot|collision|lane", "Exterior", "Sensors and assistance",
     [("grille", "grille"), ("front", "grille"), ("detail", "grille")]),
    (r"panorama|roof", "Exterior", "Roof", [("road", "default")]),
    (r"range|charging|electric", "Driving", "Range and charging", [("road", "default")]),
    (r"cushioning|damping|riding|ride comfort|handling|chassis|quality of ride|sportiness", "Driving", "Ride and handling", [("road", "default")]),
    (r"drivetrain|engine|drive|modes|acceleration", "Driving", "Powertrain", [("road", "default")]),
    (r"acoustic|noise", "Driving", "Quietness", [("road", "default")]),
    (r"exterior|design|paint|body", "Exterior", "Exterior design", [("front", "default"), ("road", "default")]),
]


def for_topic(vehicle: str, topic: str) -> dict:
    photos = PHOTOS.get(vehicle, {})
    t = topic.lower()
    for pattern, aspect, part, options in RULES:
        if re.search(pattern, t):
            # Prefer a photo that shows the exact part, then any listed photo at its default framing.
            exact = [(p, k) for p, k in options if p in photos and k in photos[p]]
            loose = [(p, "default") for p, _ in options if p in photos]
            for photo, key in exact + loose:
                x, y = photos[photo][key]
                return {"aspect": aspect, "part": part, "photo": f"/cars/{vehicle}/{photo}.jpg", "focal_x": x, "focal_y": y}
            break
    photo = "front" if "front" in photos else next(iter(photos), None)
    x, y = photos[photo]["default"] if photo else (50, 50)
    return {"aspect": "Vehicle", "part": "Whole vehicle", "photo": f"/cars/{vehicle}/{photo}.jpg" if photo else None,
            "focal_x": x, "focal_y": y}
