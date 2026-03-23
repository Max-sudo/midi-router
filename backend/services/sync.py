# ── Sync service for lead sheet data ──────────────────────────────
import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SYNC_FILE = Path(__file__).parent.parent / "sync_data.json"
_lock = threading.Lock()

_EMPTY: dict[str, Any] = {
    "setlists": [],
    "tags": {},
    "notes": {},
    "renames": {},
    "recently_deleted": [],
}


def load_data() -> dict:
    """Read sync data from disk, auto-purging old deleted items."""
    with _lock:
        try:
            data = json.loads(SYNC_FILE.read_text())
        except Exception:
            data = {k: (v.copy() if isinstance(v, (dict, list)) else v)
                    for k, v in _EMPTY.items()}
        # Ensure all keys exist
        for key, default in _EMPTY.items():
            if key not in data:
                data[key] = default.copy() if isinstance(default, (dict, list)) else default
        # Auto-purge items deleted more than 30 days ago
        _purge_deleted_inplace(data, 30)
        return data


def save_data(data: dict) -> None:
    """Write sync data to disk."""
    with _lock:
        SYNC_FILE.write_text(json.dumps(data, indent=2))


def _purge_deleted_inplace(data: dict, days: int) -> None:
    """Remove recently_deleted entries older than `days` days (in-place)."""
    now = datetime.now(timezone.utc)
    kept = []
    for item in data.get("recently_deleted", []):
        deleted_at = item.get("deleted_at")
        if deleted_at:
            try:
                dt = datetime.fromisoformat(deleted_at)
                if (now - dt).days < days:
                    kept.append(item)
                    continue
            except (ValueError, TypeError):
                pass
        # No valid timestamp — keep it to be safe
        kept.append(item)
    data["recently_deleted"] = kept


def purge_deleted(days: int = 30) -> dict:
    """Load data, purge, save, return cleaned data."""
    data = load_data()
    _purge_deleted_inplace(data, days)
    save_data(data)
    return data


# ── Merge helpers ─────────────────────────────────────────────────

def merge_setlists(local: list, server: list) -> list:
    """Additive merge of set lists by id.

    If the same id exists in both, keep the one with more songs.
    All unique ids from both sides are kept.
    """
    by_id: dict[str, dict] = {}
    for sl in server:
        sid = sl.get("id")
        if sid:
            by_id[sid] = sl
    for sl in local:
        sid = sl.get("id")
        if not sid:
            continue
        existing = by_id.get(sid)
        if existing is None:
            by_id[sid] = sl
        else:
            # Keep the one with more songs
            local_songs = len(sl.get("songs", []))
            server_songs = len(existing.get("songs", []))
            if local_songs >= server_songs:
                by_id[sid] = sl
    return list(by_id.values())


def merge_tags(local: dict, server: dict) -> dict:
    """Union merge — combine tag arrays per song title."""
    merged = dict(server)
    for song, tags in local.items():
        if song in merged:
            merged[song] = list(set(merged[song]) | set(tags))
        else:
            merged[song] = list(tags)
    return merged


def merge_notes(local: dict, server: dict) -> dict:
    """Union merge — combine note arrays per song title."""
    merged = dict(server)
    for song, notes in local.items():
        if song in merged:
            merged[song] = list(set(merged[song]) | set(notes))
        else:
            merged[song] = list(notes)
    return merged


def merge_renames(local: dict, server: dict) -> dict:
    """Keep all renames. Local wins on conflict."""
    merged = dict(server)
    merged.update(local)
    return merged


def delete_setlist(setlist_id: str) -> dict:
    """Soft-delete: move a set list to recently_deleted with a timestamp."""
    data = load_data()
    found = None
    remaining = []
    for sl in data["setlists"]:
        if sl.get("id") == setlist_id:
            found = sl
        else:
            remaining.append(sl)
    if found is None:
        return data
    found["deleted_at"] = datetime.now(timezone.utc).isoformat()
    data["setlists"] = remaining
    data["recently_deleted"].append(found)
    save_data(data)
    return data


def restore_setlist(setlist_id: str) -> dict:
    """Restore a set list from recently_deleted back to setlists."""
    data = load_data()
    found = None
    remaining = []
    for sl in data["recently_deleted"]:
        if sl.get("id") == setlist_id:
            found = sl
        else:
            remaining.append(sl)
    if found is None:
        return data
    found.pop("deleted_at", None)
    data["recently_deleted"] = remaining
    data["setlists"].append(found)
    save_data(data)
    return data
