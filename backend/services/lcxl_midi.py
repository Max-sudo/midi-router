# ── Launch Control XL MIDI listener (python-rtmidi) ──────────────────
from __future__ import annotations
import threading
import time
import json
from typing import Callable

try:
    import rtmidi
except ImportError:
    rtmidi = None

from . import lcxl_mappings

# WebSocket broadcast callback — set by server.py
_ws_broadcast: Callable | None = None
_listener_thread: threading.Thread | None = None
_running = False
_connected_port: str = ""
_midi_input = None           # open rtmidi.MidiIn for LCXL
_midi_output = None          # MidiOut for sending to XR18

LCXL_KEYWORDS = ["launch control xl"]
XR18_KEYWORDS = ["xr18", "x-air", "x air", "xair"]

# Toggle state tracking for buttons in toggle mode
_toggle_states: dict[str, bool] = {}  # control_id → True=on / False=off


def set_ws_broadcast(callback: Callable):
    """Set the callback that broadcasts events to connected WebSocket clients."""
    global _ws_broadcast
    _ws_broadcast = callback


def get_status() -> dict:
    return {
        "connected": bool(_connected_port),
        "port_name": _connected_port,
        "listener_running": _running,
        "output_port": _get_output_port_name(),
    }


def _get_output_port_name() -> str:
    """Return the name of the currently connected XR18 output port."""
    if _midi_output:
        return getattr(_midi_output, "_port_name", "")
    return ""


def _find_lcxl_input():
    """Scan MIDI inputs for Launch Control XL port."""
    if not rtmidi:
        print("[LCXL] rtmidi not available", flush=True)
        return None, None

    midi_in = rtmidi.MidiIn()
    count = midi_in.get_port_count()
    print(f"[LCXL] Scanning {count} MIDI inputs...", flush=True)

    for i in range(count):
        name = midi_in.get_port_name(i)
        print(f"[LCXL]   Input {i}: {name}", flush=True)
        name_lower = name.lower()
        # Skip DAW-related ports
        if "daw" in name_lower or "din" in name_lower:
            continue
        if any(kw in name_lower for kw in LCXL_KEYWORDS):
            return i, name

    return None, None


def _find_xr18_output():
    """Scan MIDI outputs for XR18/X-Air port."""
    if not rtmidi:
        return None, None

    midi_out = rtmidi.MidiOut()
    count = midi_out.get_port_count()
    print(f"[LCXL] Scanning {count} MIDI outputs...", flush=True)

    for i in range(count):
        name = midi_out.get_port_name(i)
        print(f"[LCXL]   Output {i}: {name}", flush=True)
        name_lower = name.lower()
        # Skip DAW-related ports
        if "daw" in name_lower:
            continue
        if any(kw in name_lower for kw in XR18_KEYWORDS):
            return i, name

    return None, None


def _open_xr18_output():
    """Try to open the XR18 MIDI output port."""
    global _midi_output
    if _midi_output:
        return True

    out_idx, out_name = _find_xr18_output()
    if out_idx is None:
        print("[LCXL] No XR18 output port found", flush=True)
        return False

    try:
        _midi_output = rtmidi.MidiOut()
        _midi_output.open_port(out_idx)
        _midi_output._port_name = out_name  # stash for status reporting
        print(f"[LCXL] XR18 output opened: {out_name}", flush=True)
        return True
    except Exception as e:
        print(f"[LCXL] Failed to open XR18 output: {e}", flush=True)
        _midi_output = None
        return False


def _send_to_xr18(channel: int, cc: int, value: int):
    """Send a CC message to the XR18 output."""
    if not _midi_output:
        if not _open_xr18_output():
            return False

    status = 0xB0 | (channel & 0x0F)
    try:
        _midi_output.send_message([status, cc & 0x7F, value & 0x7F])
        return True
    except Exception as e:
        print(f"[LCXL] Send to XR18 failed: {e}", flush=True)
        return False


def _on_midi_message(event, data=None):
    """Called by python-rtmidi when a MIDI message arrives from the LCXL."""
    message, delta_time = event
    if len(message) < 3:
        return

    status_byte = message[0]
    status = status_byte & 0xF0
    channel = status_byte & 0x0F
    number = message[1]   # CC number or note number
    value = message[2]    # CC value or velocity

    # Skip clock and system messages
    if status_byte >= 0xF0:
        return

    port_name = data or "unknown"

    # Determine message type
    if status == 0xB0:
        msg_type = "cc"
    elif status == 0x90:
        msg_type = "note"
    elif status == 0x80:
        # Note-off — ignore for mapping purposes
        return
    else:
        return

    print(f"[LCXL MIDI] port={port_name} type={msg_type} ch={channel} "
          f"num={number} val={value}", flush=True)

    # Look up which LCXL control this corresponds to
    control_id = lcxl_mappings.lookup_control_id(msg_type, channel, number)
    if not control_id:
        print(f"[LCXL] No control mapped for {msg_type} ch={channel} num={number}", flush=True)
        return

    # Look up the mapping for this control
    mapping = lcxl_mappings.get_mapping(control_id)

    # Broadcast event to WebSocket clients
    if _ws_broadcast:
        event_data = {
            "type": "control_event",
            "control_id": control_id,
            "value": value,
            "has_mapping": mapping is not None,
            "label": mapping.get("label", "") if mapping else "",
        }
        try:
            _ws_broadcast(json.dumps(event_data))
        except Exception:
            pass

    # Forward to XR18 if a mapping is configured
    if mapping:
        target_channel = mapping.get("target_channel")
        target_cc = mapping.get("target_cc")
        mode = mapping.get("mode", "continuous")

        if target_channel is not None and target_cc is not None:
            if mode == "toggle":
                # Only react on note-on (velocity > 0)
                if value == 0:
                    return
                # Toggle between 0 and 127
                current = _toggle_states.get(control_id, False)
                new_state = not current
                _toggle_states[control_id] = new_state
                send_value = 127 if new_state else 0
                ok = _send_to_xr18(target_channel, target_cc, send_value)
                print(f"[LCXL] Toggle {control_id} → ch={target_channel+1} "
                      f"cc={target_cc} val={send_value} ({'OK' if ok else 'FAIL'})",
                      flush=True)

                # Broadcast toggle state
                if _ws_broadcast:
                    try:
                        _ws_broadcast(json.dumps({
                            "type": "toggle_state",
                            "control_id": control_id,
                            "state": new_state,
                        }))
                    except Exception:
                        pass
            else:
                # Continuous: forward value directly
                ok = _send_to_xr18(target_channel, target_cc, value)
                print(f"[LCXL] Forward {control_id} → ch={target_channel+1} "
                      f"cc={target_cc} val={value} ({'OK' if ok else 'FAIL'})",
                      flush=True)


def _close_all():
    """Close all open MIDI ports."""
    global _midi_input, _connected_port, _midi_output
    if _midi_input:
        try:
            _midi_input.close_port()
        except Exception:
            pass
        _midi_input = None
    _connected_port = ""
    if _midi_output:
        try:
            _midi_output.close_port()
        except Exception:
            pass
        _midi_output = None


def _listener_loop():
    """Background thread that maintains connection to LCXL and XR18."""
    global _connected_port, _running, _midi_input

    if not rtmidi:
        print("[LCXL] python-rtmidi not installed — listener disabled", flush=True)
        return

    while _running:
        if not _midi_input:
            # Try to find and connect to Launch Control XL
            port_idx, port_name = _find_lcxl_input()
            if port_idx is not None:
                try:
                    mi = rtmidi.MidiIn()
                    mi.ignore_types(sysex=True, timing=True, active_sense=True)
                    mi.set_callback(_on_midi_message, port_name)
                    mi.open_port(port_idx)
                    _midi_input = mi
                    _connected_port = port_name
                    print(f"[LCXL] Connected to: {port_name}", flush=True)

                    # Also try to open XR18 output
                    _open_xr18_output()

                    if _ws_broadcast:
                        _ws_broadcast(json.dumps({
                            "type": "status",
                            "connected": True,
                            "port_name": _connected_port,
                        }))
                except Exception as e:
                    print(f"[LCXL] Connection failed for {port_name}: {e}", flush=True)

        # Verify the LCXL port still exists
        if _midi_input:
            try:
                check = rtmidi.MidiIn()
                available = set()
                for i in range(check.get_port_count()):
                    available.add(check.get_port_name(i))

                if _connected_port not in available:
                    print(f"[LCXL] Lost port: {_connected_port}", flush=True)
                    _close_all()
                    if _ws_broadcast:
                        _ws_broadcast(json.dumps({
                            "type": "status",
                            "connected": False,
                            "port_name": "",
                        }))
            except Exception:
                pass

        # Also check if XR18 output appeared/disappeared
        if _midi_input and not _midi_output:
            _open_xr18_output()

        time.sleep(2)  # Poll every 2 seconds


def start():
    """Start the LCXL listener background thread."""
    global _running, _listener_thread
    if _running:
        return

    _running = True
    _listener_thread = threading.Thread(target=_listener_loop, daemon=True)
    _listener_thread.start()
    print("[LCXL] Listener started", flush=True)


def stop():
    """Stop the listener thread."""
    global _running
    _running = False
    _close_all()
