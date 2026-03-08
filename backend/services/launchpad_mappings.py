# ── Launchpad pad-to-action mapping storage ────────────────────────
import json
import threading
from pathlib import Path

STORAGE_DIR = Path(__file__).parent.parent
MAPPINGS_FILE = STORAGE_DIR / "launchpad_mappings.json"

_lock = threading.Lock()
_data: dict = {
    "active_profile": "Default",
    "profiles": {
        "Default": {},  # pad_note (str) → { action_type, params, label, color }
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


# ── Active profile ─────────────────────────────────────────────────

def get_active_profile_name() -> str:
    with _lock:
        return _data.get("active_profile", "Default")


def get_all_mappings() -> dict:
    """Return all mappings for the active profile."""
    with _lock:
        profile = _data["active_profile"]
        return dict(_data["profiles"].get(profile, {}))


def get_mapping(pad_note: int) -> dict | None:
    with _lock:
        profile = _data["active_profile"]
        return _data["profiles"].get(profile, {}).get(str(pad_note))


def set_mapping(pad_note: int, action: dict):
    with _lock:
        profile = _data["active_profile"]
        if profile not in _data["profiles"]:
            _data["profiles"][profile] = {}
        _data["profiles"][profile][str(pad_note)] = action
        _save()


def delete_mapping(pad_note: int):
    with _lock:
        profile = _data["active_profile"]
        mappings = _data["profiles"].get(profile, {})
        mappings.pop(str(pad_note), None)
        _save()


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
