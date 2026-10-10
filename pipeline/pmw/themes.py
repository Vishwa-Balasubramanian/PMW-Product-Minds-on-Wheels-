"""Reviewed static theme map, proposed from the supplied BMW taxonomy.

Versioned code, never a live clustering call: the same input produces the same
themes. Only related customer tasks are merged; broad catch-all labels retain
their scope exclusions. Original labels remain untouched for traceability.
"""
THEME_VERSION = "2026-10-v1"
THEMES = {
    "Climate control": (
        "Vehicle, climatization", "Air conditioning, setting", "Air conditioning control panel"),
    "Connected services and phone integration": (
        "Personal eSIM", "My BMW App / MINI App",
        "Remote Services & Remote Keyless Entry (My BMW App/MINI App)",
        "ConnectedDrive and Infotainment, overall technology", "Apple CarPlay"),
    "Touchscreen and everyday controls": (
        "Operating concept, operating system", "Touch screen, operation"),
    "Ride comfort and handling": ("Handling / Riding", "Cushioning / damping vehicle"),
    "Cabin storage": ("Storage compartments", "Center console, front"),
}
TOPIC_TO_THEME = {topic: theme for theme, members in THEMES.items() for topic in members}


def theme_for(topic: str) -> str:
    return TOPIC_TO_THEME.get(topic, topic)


def member_topics(theme: str) -> tuple[str, ...]:
    return THEMES.get(theme, (theme,))


def photo_topic(theme: str) -> str:
    # Reuse Arjun's existing photo rules instead of introducing a second mapping.
    return member_topics(theme)[0]
