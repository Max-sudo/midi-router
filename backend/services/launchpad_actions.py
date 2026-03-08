# ── Execute macOS actions triggered by Launchpad pads ──────────────
import subprocess
import shlex
from pathlib import Path

# Cached app list and paths
_app_cache: list[str] | None = None
_app_paths: dict[str, Path] = {}  # app_name → .app bundle path
_icon_cache_dir: Path = Path(__file__).parent.parent / ".icon_cache"


def list_apps() -> list[str]:
    """Return sorted list of installed macOS application names."""
    global _app_cache
    if _app_cache is not None:
        return _app_cache

    apps = set()
    search_dirs = [
        Path("/Applications"),
        Path("/System/Applications"),
        Path.home() / "Applications",
        Path("/System/Applications/Utilities"),
    ]

    for d in search_dirs:
        if not d.exists():
            continue
        for item in d.rglob("*.app"):
            # Only top-level .app bundles (skip nested .app inside .app)
            parts = item.relative_to(d).parts
            app_depth = sum(1 for p in parts if p.endswith(".app"))
            if app_depth <= 1:
                apps.add(item.stem)
                _app_paths[item.stem] = item

    _app_cache = sorted(apps, key=str.lower)
    return _app_cache


def get_app_icon(app_name: str) -> Path | None:
    """Get a PNG icon for the named app. Returns cached PNG path or None."""
    # Ensure app list is loaded
    list_apps()

    _icon_cache_dir.mkdir(exist_ok=True)
    safe_name = app_name.replace("/", "_").replace(" ", "_")
    cached = _icon_cache_dir / f"{safe_name}.png"

    if cached.exists():
        return cached

    app_path = _app_paths.get(app_name)
    if not app_path or not app_path.exists():
        return None

    # Find the .icns file in the app bundle
    icns = None
    # Try reading CFBundleIconFile from Info.plist
    import plistlib
    plist_path = app_path / "Contents" / "Info.plist"
    if plist_path.exists():
        try:
            with open(plist_path, "rb") as f:
                plist = plistlib.load(f)
            icon_name = plist.get("CFBundleIconFile", "")
            if icon_name:
                if not icon_name.endswith(".icns"):
                    icon_name += ".icns"
                candidate = app_path / "Contents" / "Resources" / icon_name
                if candidate.exists():
                    icns = candidate
        except Exception:
            pass

    # Fallback: look for any .icns in Resources
    if not icns:
        resources = app_path / "Contents" / "Resources"
        if resources.exists():
            for f in resources.glob("*.icns"):
                icns = f
                break

    if not icns:
        return None

    # Convert to 64x64 PNG using sips
    try:
        subprocess.run(
            ["sips", "-s", "format", "png", "-z", "64", "64",
             str(icns), "--out", str(cached)],
            capture_output=True, timeout=10,
        )
        if cached.exists():
            return cached
    except Exception:
        pass

    return None


def clear_app_cache():
    global _app_cache
    _app_cache = None
    _app_paths.clear()


def execute(action: dict) -> dict:
    """Execute a mapped action. Returns { success, output, error }."""
    action_type = action.get("action_type", "")
    params = action.get("params", {})

    try:
        if action_type == "open_app":
            return _open_app(params.get("app_name", ""))
        elif action_type == "keyboard_shortcut":
            return _keyboard_shortcut(params.get("keys", ""))
        elif action_type == "applescript":
            return _run_applescript(params.get("script", ""))
        elif action_type == "shell":
            return _run_shell(params.get("command", ""))
        else:
            return {"success": False, "output": "", "error": f"Unknown action type: {action_type}"}
    except Exception as e:
        return {"success": False, "output": "", "error": str(e)}


def _open_app(app_name: str) -> dict:
    if not app_name:
        return {"success": False, "output": "", "error": "No app name specified"}

    result = subprocess.run(
        ["open", "-a", app_name],
        capture_output=True,
        text=True,
        timeout=10,
    )
    return {
        "success": result.returncode == 0,
        "output": result.stdout.strip(),
        "error": result.stderr.strip() if result.returncode != 0 else "",
    }


def _keyboard_shortcut(keys: str) -> dict:
    """Send a keyboard shortcut via AppleScript.
    Format: "cmd+shift+a" or "ctrl+alt+delete"
    """
    if not keys:
        return {"success": False, "output": "", "error": "No keys specified"}

    parts = [k.strip().lower() for k in keys.split("+")]
    key = parts[-1]
    modifiers = parts[:-1]

    # Build AppleScript modifier string
    modifier_map = {
        "cmd": "command down",
        "command": "command down",
        "shift": "shift down",
        "alt": "option down",
        "option": "option down",
        "ctrl": "control down",
        "control": "control down",
    }

    using = ", ".join(modifier_map.get(m, "") for m in modifiers if m in modifier_map)

    # Handle special keys
    special_keys = {
        "space": "space",
        "tab": "tab",
        "return": "return",
        "enter": "return",
        "escape": "escape",
        "delete": "delete",
        "up": "up arrow",
        "down": "down arrow",
        "left": "left arrow",
        "right": "right arrow",
    }

    if key in special_keys:
        script = f'tell application "System Events" to key code {_key_code(key)}'
        if using:
            script = f'tell application "System Events" to key code {_key_code(key)} using {{{using}}}'
    else:
        if using:
            script = f'tell application "System Events" to keystroke "{key}" using {{{using}}}'
        else:
            script = f'tell application "System Events" to keystroke "{key}"'

    return _run_applescript(script)


def _key_code(key_name: str) -> int:
    """Map key names to macOS virtual key codes."""
    codes = {
        "space": 49, "tab": 48, "return": 36, "escape": 53,
        "delete": 51, "up": 126, "down": 125, "left": 123, "right": 124,
        "f1": 122, "f2": 120, "f3": 99, "f4": 118,
        "f5": 96, "f6": 97, "f7": 98, "f8": 100,
    }
    return codes.get(key_name, 0)


def _run_applescript(script: str) -> dict:
    if not script:
        return {"success": False, "output": "", "error": "No script specified"}

    result = subprocess.run(
        ["osascript", "-e", script],
        capture_output=True,
        text=True,
        timeout=15,
    )
    return {
        "success": result.returncode == 0,
        "output": result.stdout.strip(),
        "error": result.stderr.strip() if result.returncode != 0 else "",
    }


def _run_shell(command: str) -> dict:
    if not command:
        return {"success": False, "output": "", "error": "No command specified"}

    result = subprocess.run(
        command,
        shell=True,
        capture_output=True,
        text=True,
        timeout=15,
    )
    return {
        "success": result.returncode == 0,
        "output": result.stdout.strip(),
        "error": result.stderr.strip() if result.returncode != 0 else "",
    }
