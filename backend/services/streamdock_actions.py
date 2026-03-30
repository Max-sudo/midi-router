# ── Execute macOS actions triggered by Stream Dock buttons ──────────
from __future__ import annotations
from . import launchpad_actions


# Action types shared with Launchpad (delegated directly)
_SHARED_ACTIONS = {
    "open_app", "open_url", "keyboard_shortcut",
    "applescript", "shell", "workspace",
}

# Mute state tracking for toggle
_muted: bool | None = None


def execute(action: dict) -> dict:
    """Execute a mapped action. Returns { success, output, error }."""
    action_type = action.get("action_type", "")
    params = action.get("params", {})

    try:
        if action_type in _SHARED_ACTIONS:
            return launchpad_actions.execute(action)

        if action_type == "media_play_pause":
            return _media_play_pause()
        elif action_type == "media_previous":
            return _media_previous()
        elif action_type == "media_next":
            return _media_next()
        elif action_type == "volume_up":
            return _volume_change(params.get("step", 10))
        elif action_type == "volume_down":
            return _volume_change(-params.get("step", 10))
        elif action_type == "toggle_mute":
            return _toggle_mute()
        else:
            return {"success": False, "output": "", "error": f"Unknown action type: {action_type}"}
    except Exception as e:
        return {"success": False, "output": "", "error": str(e)}


def get_mute_state() -> bool | None:
    """Return cached mute state (None if unknown)."""
    return _muted


def _media_play_pause() -> dict:
    """Toggle media play/pause using macOS media key."""
    script = 'tell application "System Events" to key code 100'
    return launchpad_actions._run_applescript(script)


def _media_previous() -> dict:
    """Previous track using macOS media key (F7)."""
    script = 'tell application "System Events" to key code 98'
    return launchpad_actions._run_applescript(script)


def _media_next() -> dict:
    """Next track using macOS media key (F9)."""
    script = 'tell application "System Events" to key code 101'
    return launchpad_actions._run_applescript(script)


def _volume_change(step: int) -> dict:
    """Change system volume by step (positive = up, negative = down)."""
    script = f'''
    set curVol to output volume of (get volume settings)
    set newVol to curVol + ({step})
    if newVol > 100 then set newVol to 100
    if newVol < 0 then set newVol to 0
    set volume output volume newVol
    return newVol
    '''
    return launchpad_actions._run_applescript(script)


def _toggle_mute() -> dict:
    """Toggle system microphone mute."""
    global _muted
    script = '''
    set curMuted to input volume of (get volume settings)
    if curMuted is 0 then
        set volume input volume 75
        return "unmuted"
    else
        set volume input volume 0
        return "muted"
    end if
    '''
    result = launchpad_actions._run_applescript(script)
    if result["success"]:
        _muted = result["output"].strip() == "muted"
    return result
