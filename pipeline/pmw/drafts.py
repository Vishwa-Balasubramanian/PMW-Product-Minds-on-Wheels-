"""Reviewed customer-task profiles. Offline hypotheses, never claimed as live AI.

Each profile specifies observable customer behaviour. Original comment IDs are
attached at build time; a product manager must validate the proposed explanation.
"""
from __future__ import annotations

import re

# Pattern: title, need, observable requirement, validation task, causal hypothesis.
PROFILES = [
    (r"connected|esim|carplay|\bapp\b|remote services", (
        "Connected features that recover gracefully",
        "Owners need dependable access to connected features and clear recovery guidance.",
        "show connection and activation status and guide owners through recovery when a connected feature becomes unavailable",
        "Owners shall be able to identify the failed connection and restore the affected feature without resetting unrelated preferences.",
        "setup and recovery guidance may not match the steps owners expect")),
    (r"touchscreen|touch screen|operating concept|everyday controls", (
        "Everyday controls without menu hunting",
        "Drivers need to operate frequent functions without searching through unfamiliar menus.",
        "keep frequent controls discoverable and preserve a clear route back from every settings screen",
        "In usability testing, drivers shall locate and change a familiar setting without coaching or losing their previous context.",
        "the organisation of controls may conflict with drivers' learned expectations")),
    (r"climat|air conditioning", (
        "Comfortable cabin with understandable climate controls",
        "Passengers need to direct airflow and understand how to reach their preferred temperature.",
        "make airflow and temperature adjustments discoverable and show whether the requested climate setting is active",
        "Passengers shall be able to adjust their settings and verify the result during warm and cold cabin trials.",
        "control discoverability and perceived cooling performance may contribute to dissatisfaction")),
    (r"electric range", (
        "Range guidance drivers can plan around",
        "Drivers need to understand whether a planned journey is achievable under the current conditions.",
        "explain changes to remaining-range estimates and show how weather, cabin comfort and route conditions affect trip planning",
        "Drivers shall be able to recognise when a charging stop is needed and revise the route before the destination becomes unreachable.",
        "range expectations may not account for changing journey and comfort conditions")),
    (r"public charging", (
        "Find compatible charging along the journey",
        "Drivers need to find usable charging locations and understand compatibility before arrival.",
        "identify compatible charging stops on the planned route and provide an alternative when availability is unknown",
        "Drivers shall be able to replace an unusable charging stop while retaining their destination.",
        "charging information may not resolve compatibility and availability questions")),
    (r"charge high|battery charg", (
        "Charging progress with clear next steps",
        "Owners need to understand charging progress and unexpected delays.",
        "show charging progress, explain known limitations and provide a recovery action when charging is interrupted",
        "Owners shall be able to distinguish a normal limitation from a charging fault during a charging-session review.",
        "charging feedback may not explain the difference between expected and observed progress")),
    (r"seat", (
        "Seats that adapt to everyday comfort needs",
        "Passengers need a comfortable supported seating position and independently usable adjustments.",
        "make seat adjustments easy to locate and allow occupants to establish and restore a comfortable seating position",
        "Occupants with different seating preferences shall complete an adjustment and entry task without coaching.",
        "adjustment access, available movement and perceived material comfort may affect occupants differently")),
    (r"brak", (
        "Predictable and comfortable braking",
        "Drivers need braking behaviour they can anticipate during everyday stops.",
        "provide progressive braking feedback and avoid unexpected noise or vibration during ordinary stopping manoeuvres",
        "Drivers shall be able to complete smooth stops in representative low-speed and changing-weather trials.",
        "perceived response during everyday stops may differ from drivers' expectations")),
    (r"non-contact trunk", (
        "Hands-free boot opening with clear feedback",
        "Owners need to open the boot while carrying belongings and recognise a successful gesture.",
        "confirm when a boot-opening gesture is recognised and provide an accessible alternative when it is not",
        "Owners carrying luggage shall be able to open the boot without repeated unexplained attempts.",
        "gesture feedback may not make the activation conditions clear")),
    (r"door|lock|vehicle key", (
        "Doors and access that behave predictably",
        "Owners need to enter, leave and secure the vehicle with a clear understanding of its access state.",
        "make door and lock states understandable and provide discoverable access controls when automatic behaviour is unexpected",
        "Owners shall be able to explain and complete entry, exit and locking tasks without guessing the vehicle's state.",
        "automatic access behaviour may not match users' expectations about opening and locking")),
    (r"navigation", (
        "Navigation that is ready when needed",
        "Drivers need clear guidance and a straightforward way to recover when directions are unavailable.",
        "show navigation readiness and provide understandable recovery steps when guidance is delayed or incomplete",
        "Drivers shall be able to start and revise a route without losing the intended destination.",
        "readiness feedback and route detail may not meet drivers' expectations")),
    (r"instrument", (
        "Driving information that is easy to interpret",
        "Drivers need to recognise essential driving information without decoding unfamiliar displays.",
        "present essential driving information with understandable labels and consistent locations",
        "Drivers shall be able to identify the active display and interpret its key messages without coaching.",
        "display organisation and symbols may create avoidable interpretation effort")),
    (r"audio|sound|usb", (
        "Audio sources that are easy to enjoy",
        "Passengers need to choose their preferred audio source and understand playback controls.",
        "make supported audio sources discoverable and explain when a selected source is unavailable",
        "Passengers shall be able to select a supported source, adjust playback and return to it after switching sources.",
        "playback functions may not match how passengers expect to access audio")),
    (r"ride comfort|handling|cushioning|damping", (
        "Ride comfort suited to everyday journeys",
        "Passengers need comfortable travel while drivers retain a predictable sense of control.",
        "provide understandable ride settings for choosing comfort appropriate to ordinary road conditions",
        "Occupants shall be able to select their preferred setting and assess comfort over representative uneven roads.",
        "ride preferences and road conditions may differ across people represented in the feedback")),
    (r"drivetrain|transmission", (
        "Predictable response during everyday driving",
        "Drivers need to understand the response when starting, accelerating and slowing down.",
        "provide consistent responses to ordinary driving inputs and explain changes between available driving settings",
        "Drivers shall be able to anticipate vehicle response during departure, acceleration and stop-and-go trials.",
        "changes in driving response may require more adaptation than owners expect")),
    (r"modes", (
        "Driving preferences that are easy to restore",
        "Drivers need to choose their preferred driving experience and understand which preferences persist.",
        "make driving preferences easy to select and explain which settings will be restored on the next journey",
        "Drivers shall be able to restore an available preference without repeatedly searching through settings.",
        "preference persistence may not be clearly communicated")),
    (r"roof", (
        "Roof and shade controls without uncertainty",
        "Passengers need to operate the roof and shade and understand interrupted actions.",
        "provide discoverable roof and shade controls with position feedback and recovery guidance",
        "Passengers shall be able to complete a shade adjustment and identify its resulting position without coaching.",
        "control feedback may leave passengers uncertain about roof or shade state")),
    (r"mirror", (
        "Mirrors that support everyday manoeuvres",
        "Drivers need to adjust and use mirrors reliably when driving and parking.",
        "make mirror adjustments and automatic parking behaviour understandable and allow drivers to restore their preferred view",
        "Drivers shall be able to set a useful view and recognise when automatic mirror behaviour is active.",
        "automatic adjustment behaviour may not align with the driver's intended view")),
    (r"wheel|tire|tyre", (
        "Wheels and tyres suited to daily comfort",
        "Owners need predictable comfort and understandable information about fitted wheels and tyres.",
        "help owners understand how available wheel and tyre choices affect everyday ride and noise",
        "Owners shall be able to compare available comfort characteristics during representative road trials.",
        "fitted tyre characteristics may not match some owners' comfort expectations")),
    (r"driver assistance|highway assistant", (
        "Driving assistance with understandable behaviour",
        "Drivers need to understand when assistance is active and which actions remain their responsibility.",
        "make assistance availability, activation and handover understandable during supported driving situations",
        "Drivers shall be able to identify the assistance state and respond to a handover without coaching.",
        "assistance states and control choices may be unclear to unfamiliar drivers")),
    (r"wireless charging", (
        "Phone charging with clear placement feedback",
        "Passengers need to know whether their phone is positioned correctly and charging.",
        "show whether a supported phone is charging and explain how to correct placement when charging stops",
        "Passengers shall be able to start and verify charging without repeated unexplained repositioning.",
        "placement feedback may not explain failed phone-charging attempts")),
    (r"storage|luggage|console", (
        "Storage that fits everyday belongings",
        "Passengers need accessible places for belongings carried on ordinary journeys.",
        "provide discoverable storage for representative everyday belongings without obstructing passenger movement",
        "Passengers shall be able to load, retrieve and secure their belongings during an entry and travel task.",
        "storage locations may not fit how occupants carry and access belongings")),
    (r"exterior|interior design", (
        "An appearance owners enjoy living with",
        "Owners need a vehicle appearance and finish that meet everyday expectations.",
        "present a consistent visible finish across adjacent surfaces and make available appearance choices clear before selection",
        "Owners shall be able to inspect representative surfaces under ordinary lighting and recognise the chosen appearance in the delivered vehicle.",
        "a broad appearance label may conceal distinct styling preferences and finish concerns")),
]


def make(signal: dict, quotes: list[dict]) -> dict:
    selected = next((p for pattern, p in PROFILES if re.search(pattern, signal['topic'], re.I)), None)
    if not selected:
        selected = ("Everyday functions that are easier to use",
                    "Owners need to complete the customer task described in the supporting feedback.",
                    "provide clear controls and feedback for the reported customer task",
                    "Owners shall be able to complete the task in a usability review without coaching.",
                    "expected and available behaviour may differ")
    title, need, behaviour, acceptance, hypothesis = selected
    ids = ', '.join(q['id'] for q in quotes[:2])
    evidence = f"The labelled comments ({ids}) motivate this investigation." if ids else "Direct supporting evidence is unavailable."
    return {
        "title": title, "root_cause": f"Working hypothesis: {hypothesis}. {evidence}",
        "customer_need": need,
        "requirement": f"The successor vehicle shall {behaviour}. {acceptance}",
        "future_lens": "current_pain",
        "assumptions": ["Successor-planning assumption: this customer task remains relevant as interfaces and customer habits change."],
        "uncertainties": [
            "The cause is a hypothesis; reproduce the cited customer task before choosing a solution.",
            "Fitted equipment, software versions and feedback dates are not established by this evidence.",
            "These comments are an evidence sample, not an estimate of how many buyers experience the problem."],
        "generated_by": "evidence-template:v2",
    }
