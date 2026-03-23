# ── Launch Control XL mapping storage ─────────────────────────────
from __future__ import annotations
import json
import threading
from pathlib import Path

STORAGE_DIR = Path(__file__).parent.parent
MAPPINGS_FILE = STORAGE_DIR / "lcxl_mappings.json"

_lock = threading.Lock()

# LCXL Factory Template 1 MIDI assignments
LCXL_LAYOUT = {
    # Knob Row 1: CC 13-20 on Ch 1
    "knob_0":  {"type": "cc", "channel": 8, "cc_number": 13},
    "knob_1":  {"type": "cc", "channel": 8, "cc_number": 14},
    "knob_2":  {"type": "cc", "channel": 8, "cc_number": 15},
    "knob_3":  {"type": "cc", "channel": 8, "cc_number": 16},
    "knob_4":  {"type": "cc", "channel": 8, "cc_number": 17},
    "knob_5":  {"type": "cc", "channel": 8, "cc_number": 18},
    "knob_6":  {"type": "cc", "channel": 8, "cc_number": 19},
    "knob_7":  {"type": "cc", "channel": 8, "cc_number": 20},
    # Knob Row 2: CC 29-36 on Ch 1
    "knob_8":  {"type": "cc", "channel": 8, "cc_number": 29},
    "knob_9":  {"type": "cc", "channel": 8, "cc_number": 30},
    "knob_10": {"type": "cc", "channel": 8, "cc_number": 31},
    "knob_11": {"type": "cc", "channel": 8, "cc_number": 32},
    "knob_12": {"type": "cc", "channel": 8, "cc_number": 33},
    "knob_13": {"type": "cc", "channel": 8, "cc_number": 34},
    "knob_14": {"type": "cc", "channel": 8, "cc_number": 35},
    "knob_15": {"type": "cc", "channel": 8, "cc_number": 36},
    # Knob Row 3: CC 49-56 on Ch 1
    "knob_16": {"type": "cc", "channel": 8, "cc_number": 49},
    "knob_17": {"type": "cc", "channel": 8, "cc_number": 50},
    "knob_18": {"type": "cc", "channel": 8, "cc_number": 51},
    "knob_19": {"type": "cc", "channel": 8, "cc_number": 52},
    "knob_20": {"type": "cc", "channel": 8, "cc_number": 53},
    "knob_21": {"type": "cc", "channel": 8, "cc_number": 54},
    "knob_22": {"type": "cc", "channel": 8, "cc_number": 55},
    "knob_23": {"type": "cc", "channel": 8, "cc_number": 56},
    # Faders: CC 77-84 on Ch 1
    "fader_0": {"type": "cc", "channel": 8, "cc_number": 77},
    "fader_1": {"type": "cc", "channel": 8, "cc_number": 78},
    "fader_2": {"type": "cc", "channel": 8, "cc_number": 79},
    "fader_3": {"type": "cc", "channel": 8, "cc_number": 80},
    "fader_4": {"type": "cc", "channel": 8, "cc_number": 81},
    "fader_5": {"type": "cc", "channel": 8, "cc_number": 82},
    "fader_6": {"type": "cc", "channel": 8, "cc_number": 83},
    "fader_7": {"type": "cc", "channel": 8, "cc_number": 84},
    # Track Focus buttons (top row): Note 41-48 on Ch 1
    "btn_focus_0": {"type": "note", "channel": 8, "cc_number": 41},
    "btn_focus_1": {"type": "note", "channel": 8, "cc_number": 42},
    "btn_focus_2": {"type": "note", "channel": 8, "cc_number": 43},
    "btn_focus_3": {"type": "note", "channel": 8, "cc_number": 44},
    "btn_focus_4": {"type": "note", "channel": 8, "cc_number": 45},
    "btn_focus_5": {"type": "note", "channel": 8, "cc_number": 46},
    "btn_focus_6": {"type": "note", "channel": 8, "cc_number": 47},
    "btn_focus_7": {"type": "note", "channel": 8, "cc_number": 48},
    # Track Control buttons (bottom row): Note 73-80 on Ch 1
    "btn_ctrl_0": {"type": "note", "channel": 8, "cc_number": 73},
    "btn_ctrl_1": {"type": "note", "channel": 8, "cc_number": 74},
    "btn_ctrl_2": {"type": "note", "channel": 8, "cc_number": 75},
    "btn_ctrl_3": {"type": "note", "channel": 8, "cc_number": 76},
    "btn_ctrl_4": {"type": "note", "channel": 8, "cc_number": 77},
    "btn_ctrl_5": {"type": "note", "channel": 8, "cc_number": 78},
    "btn_ctrl_6": {"type": "note", "channel": 8, "cc_number": 79},
    "btn_ctrl_7": {"type": "note", "channel": 8, "cc_number": 80},
}

# Build reverse lookup: (type, channel, cc_number) → control_id
_INPUT_LOOKUP: dict[tuple[str, int, int], str] = {}
for _cid, _spec in LCXL_LAYOUT.items():
    _INPUT_LOOKUP[(_spec["type"], _spec["channel"], _spec["cc_number"])] = _cid


# ── Default XR18 Control preset ──────────────────────────────────
# Target CCs that correspond to XR18 channels
_XR18_CHANNELS = [
    {"target_cc": 0,  "label": "Ch 1/2 - CP88"},
    {"target_cc": 2,  "label": "Ch 3/4 - Take 5"},
    {"target_cc": 4,  "label": "Ch 5/6 - Helix"},
    {"target_cc": 6,  "label": "Ch 7/8 - SK Pro"},
    {"target_cc": 8,  "label": "Ch 9 - Vocal"},
    {"target_cc": 9,  "label": "Ch 10 - Empty"},
    {"target_cc": 14, "label": "Ch 15/16 - USB"},
    {"target_cc": 31, "label": "Main LR"},
]

def _build_default_profile() -> dict:
    """Build the default XR18 Control mapping preset."""
    mappings = {}

    for i, ch in enumerate(_XR18_CHANNELS):
        # Faders → XR18 volume (CC on Ch 1)
        mappings[f"fader_{i}"] = {
            "label": ch["label"],
            "target_channel": 0,
            "target_cc": ch["target_cc"],
            "mode": "continuous",
        }

        # Track Focus buttons → XR18 Mutes (same CCs on Ch 2, toggle 0/127)
        mappings[f"btn_focus_{i}"] = {
            "label": f"Mute {ch['label']}",
            "target_channel": 1,
            "target_cc": ch["target_cc"],
            "mode": "toggle",
        }

        # Knob Row 1 → XR18 Pan (same CCs on Ch 3)
        mappings[f"knob_{i}"] = {
            "label": f"Pan {ch['label']}",
            "target_channel": 2,
            "target_cc": ch["target_cc"],
            "mode": "continuous",
        }

    # Knob Rows 2 & 3 and Track Control buttons are left unmapped
    # for user customization (aux sends, etc.)

    return mappings


_data: dict = {
    "active_profile": "XR18 Control",
    "profiles": {
        "XR18 Control": _build_default_profile(),
    },
}


def _load():
    global _data
    if MAPPINGS_FILE.exists():
        try:
            _data = json.loads(MAPPINGS_FILE.read_text())
        except (json.JSONDecodeError, KeyError):
            pass


def _save():
    MAPPINGS_FILE.write_text(json.dumps(_data, indent=2))


def init():
    with _lock:
        _load()
        # Ensure the default profile always exists
        if "XR18 Control" not in _data.get("profiles", {}):
            _data.setdefault("profiles", {})["XR18 Control"] = _build_default_profile()
            _save()


# ── Active profile ─────────────────────────────────────────────────

def get_active_profile_name() -> str:
    with _lock:
        return _data.get("active_profile", "XR18 Control")


def get_all_mappings() -> dict:
    """Return all mappings for the active profile."""
    with _lock:
        profile = _data["active_profile"]
        return dict(_data["profiles"].get(profile, {}))


def get_mapping(control_id: str) -> dict | None:
    with _lock:
        profile = _data["active_profile"]
        return _data["profiles"].get(profile, {}).get(control_id)


def set_mapping(control_id: str, mapping: dict):
    with _lock:
        profile = _data["active_profile"]
        if profile not in _data["profiles"]:
            _data["profiles"][profile] = {}
        _data["profiles"][profile][control_id] = mapping
        _save()


def delete_mapping(control_id: str):
    with _lock:
        profile = _data["active_profile"]
        mappings = _data["profiles"].get(profile, {})
        mappings.pop(control_id, None)
        _save()


def lookup_control_id(msg_type: str, channel: int, number: int) -> str | None:
    """Given an incoming MIDI message type ('cc' or 'note'), channel, and
    CC/note number, return the LCXL control_id or None."""
    return _INPUT_LOOKUP.get((msg_type, channel, number))


def get_layout() -> dict:
    """Return the full LCXL hardware layout for the UI."""
    return dict(LCXL_LAYOUT)


# ── Profile management ─────────────────────────────────────────────

def list_profiles() -> list[str]:
    with _lock:
        return list(_data["profiles"].keys())


def save_profile(name: str):
    """Save current mappings as a named profile (or overwrite existing)."""
    with _lock:
        current = _data["active_profile"]
        current_mappings = _data["profiles"].get(current, {})
        _data["profiles"][name] = dict(current_mappings)
        _data["active_profile"] = name
        _save()


def apply_profile(name: str) -> bool:
    with _lock:
        if name not in _data["profiles"]:
            return False
        _data["active_profile"] = name
        _save()
        return True


def delete_profile(name: str) -> bool:
    with _lock:
        if name not in _data["profiles"]:
            return False
        if name == _data["active_profile"]:
            return False  # can't delete active profile
        del _data["profiles"][name]
        _save()
        return True
