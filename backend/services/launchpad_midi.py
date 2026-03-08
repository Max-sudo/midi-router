# ── Launchpad MIDI listener (python-rtmidi) ──────────────────────────
import threading
import time
import json
from typing import Callable

try:
    import rtmidi
except ImportError:
    rtmidi = None

from . import launchpad_mappings
from . import launchpad_actions

# WebSocket broadcast callback — set by server.py
_ws_broadcast: Callable | None = None
_listener_thread: threading.Thread | None = None
_running = False
_connected_ports: list[str] = []  # names of all connected LP ports
_midi_inputs: list = []           # open rtmidi.MidiIn instances
_midi_output = None               # MidiOut for sending SysEx to Launchpad

LAUNCHPAD_KEYWORDS = ["launchpad", "lpminimk3", "lpmk3"]

# Launchpad Pro MK3 SysEx messages
# Enter Programmer (standalone) mode — pads send note-on/off
# Header: F0 00 20 29 02 0E  (Novation, LP Pro MK3 device ID)
SYSEX_PROGRAMMER_MODE = [0xF0, 0x00, 0x20, 0x29, 0x02, 0x0E, 0x0E, 0x01, 0xF7]
# Enter DAW mode (pads controlled by DAW via the DAW port)
SYSEX_DAW_MODE = [0xF0, 0x00, 0x20, 0x29, 0x02, 0x0E, 0x10, 0x01, 0xF7]


def set_ws_broadcast(callback: Callable):
    """Set the callback that broadcasts events to connected WebSocket clients."""
    global _ws_broadcast
    _ws_broadcast = callback


def get_status() -> dict:
    return {
        "connected": len(_connected_ports) > 0,
        "port_name": ", ".join(_connected_ports) if _connected_ports else "",
        "listener_running": _running,
    }


def _find_all_launchpad_ports():
    """Scan MIDI inputs for all Launchpad ports."""
    if not rtmidi:
        print("[Launchpad] rtmidi not available", flush=True)
        return []

    midi_in = rtmidi.MidiIn()
    count = midi_in.get_port_count()
    print(f"[Launchpad] Scanning {count} MIDI inputs...", flush=True)

    results = []
    for i in range(count):
        name = midi_in.get_port_name(i)
        print(f"[Launchpad]   Port {i}: {name}", flush=True)
        if any(kw in name.lower() for kw in LAUNCHPAD_KEYWORDS):
            results.append((i, name))

    return results


def _find_launchpad_output():
    """Find a Launchpad MIDI output port to send SysEx."""
    if not rtmidi:
        return None, None

    midi_out = rtmidi.MidiOut()
    for i in range(midi_out.get_port_count()):
        name = midi_out.get_port_name(i)
        if any(kw in name.lower() for kw in LAUNCHPAD_KEYWORDS):
            # Prefer the MIDI port (not DAW or DIN) for SysEx
            if "daw" not in name.lower() and "din" not in name.lower():
                return i, name
    # Fallback to any Launchpad output
    for i in range(midi_out.get_port_count()):
        name = midi_out.get_port_name(i)
        if any(kw in name.lower() for kw in LAUNCHPAD_KEYWORDS):
            return i, name
    return None, None


def _enter_programmer_mode():
    """Send SysEx to put Launchpad into Programmer mode so pads send note-on."""
    global _midi_output
    try:
        out_idx, out_name = _find_launchpad_output()
        if out_idx is None:
            print("[Launchpad] No output port found for SysEx", flush=True)
            return False

        _midi_output = rtmidi.MidiOut()
        _midi_output.open_port(out_idx)
        print(f"[Launchpad] Sending Programmer Mode SysEx via: {out_name}", flush=True)
        _midi_output.send_message(SYSEX_PROGRAMMER_MODE)
        time.sleep(0.1)
        print("[Launchpad] Programmer mode activated", flush=True)
        return True
    except Exception as e:
        print(f"[Launchpad] Failed to send SysEx: {e}", flush=True)
        return False


def _parse_color(color_str: str) -> tuple[int, int, int]:
    """Parse CSS color string to (r, g, b) in 0-127 range for Launchpad."""
    r, g, b = 0, 0, 0
    color_str = color_str.strip()

    if color_str.startswith("rgb"):
        # rgb(48, 209, 88) or rgba(...)
        import re
        m = re.search(r"(\d+)\s*,\s*(\d+)\s*,\s*(\d+)", color_str)
        if m:
            r = int(m.group(1))
            g = int(m.group(2))
            b = int(m.group(3))
    elif color_str.startswith("#"):
        hex_str = color_str.lstrip("#")
        if len(hex_str) == 3:
            hex_str = "".join(c * 2 for c in hex_str)
        if len(hex_str) == 6:
            r = int(hex_str[0:2], 16)
            g = int(hex_str[2:4], 16)
            b = int(hex_str[4:6], 16)

    # Scale 0-255 → 0-127
    return (r >> 1, g >> 1, b >> 1)


def set_pad_color(note: int, r: int, g: int, b: int):
    """Set a single pad's LED color via SysEx. r/g/b are 0-127."""
    if not _midi_output:
        return
    # LP Pro MK3 SysEx: F0 00 20 29 02 0E 03  03 <note> <r> <g> <b>  F7
    # 03 = LED lighting, 03 = RGB mode
    msg = [0xF0, 0x00, 0x20, 0x29, 0x02, 0x0E, 0x03,
           0x03, note, r & 0x7F, g & 0x7F, b & 0x7F, 0xF7]
    try:
        _midi_output.send_message(msg)
    except Exception as e:
        print(f"[Launchpad] LED color failed for note {note}: {e}", flush=True)


def set_pad_off(note: int):
    """Turn off a pad's LED."""
    set_pad_color(note, 0, 0, 0)


def update_all_pad_colors():
    """Send LED colors for all mapped pads based on current mappings."""
    if not _midi_output:
        return

    # First, clear all pads (8x8 grid: notes 11-88)
    for row in range(1, 9):
        for col in range(1, 9):
            note = row * 10 + col
            set_pad_off(note)

    # Set colors for mapped pads
    all_mappings = launchpad_mappings.get_all_mappings()
    for note_str, action in all_mappings.items():
        note = int(note_str)
        color = action.get("color", "")
        if color:
            r, g, b = _parse_color(color)
            set_pad_color(note, r, g, b)

    print(f"[Launchpad] Updated {len(all_mappings)} pad LEDs", flush=True)


def _on_midi_message(event, data=None):
    """Called by python-rtmidi when a MIDI message arrives.
    event = ([status, data1, data2, ...], delta_time)
    """
    message, delta_time = event
    if len(message) < 3:
        return

    status_byte = message[0]
    status = status_byte & 0xF0
    channel = status_byte & 0x0F
    note = message[1]
    velocity = message[2]

    # Skip clock and system messages
    if status_byte >= 0xF0:
        return

    port_name = data or "unknown"
    print(f"[Launchpad MIDI] port={port_name} raw={[hex(b) for b in message]} status=0x{status:02X} ch={channel} note={note} vel={velocity}", flush=True)

    # Respond to note-on (0x90) or control change (0xB0) with velocity > 0
    if velocity == 0:
        return
    if status not in (0x90, 0xB0):
        return

    # Look up mapping
    action = launchpad_mappings.get_mapping(note)

    # Broadcast pad press to WebSocket clients
    if _ws_broadcast:
        event_data = {
            "type": "pad_press",
            "note": note,
            "velocity": velocity,
            "has_mapping": action is not None,
            "label": action.get("label", "") if action else "",
        }
        try:
            _ws_broadcast(json.dumps(event_data))
        except Exception:
            pass

    # Execute action if mapped
    if action:
        print(f"[Launchpad] Executing: {action.get('action_type')} for pad {note} — {action.get('label', '')}", flush=True)
        result = launchpad_actions.execute(action)
        if result["success"]:
            print(f"[Launchpad] Action OK for pad {note}", flush=True)
        else:
            print(f"[Launchpad] Action FAILED for pad {note}: {result['error']}", flush=True)


def _close_all():
    """Close all open MIDI inputs and output."""
    global _midi_inputs, _connected_ports, _midi_output
    for mi in _midi_inputs:
        try:
            mi.close_port()
        except Exception:
            pass
    _midi_inputs = []
    _connected_ports = []
    if _midi_output:
        try:
            _midi_output.close_port()
        except Exception:
            pass
        _midi_output = None


def _listener_loop():
    """Background thread that maintains connection to Launchpad."""
    global _connected_ports, _running, _midi_inputs

    if not rtmidi:
        print("[Launchpad] python-rtmidi not installed — listener disabled", flush=True)
        return

    while _running:
        if not _midi_inputs:
            # Try to find and connect to all Launchpad ports
            ports = _find_all_launchpad_ports()
            if ports:
                for port_idx, port_name in ports:
                    try:
                        mi = rtmidi.MidiIn()
                        mi.ignore_types(sysex=True, timing=True, active_sense=True)
                        mi.set_callback(_on_midi_message, port_name)
                        mi.open_port(port_idx)
                        _midi_inputs.append(mi)
                        _connected_ports.append(port_name)
                        print(f"[Launchpad] Connected to: {port_name}", flush=True)
                    except Exception as e:
                        print(f"[Launchpad] Connection failed for {port_name}: {e}", flush=True)

                if _connected_ports:
                    # Switch to Programmer mode so pads send note-on
                    _enter_programmer_mode()
                    # Light up mapped pads
                    time.sleep(0.2)
                    update_all_pad_colors()

                    if _ws_broadcast:
                        _ws_broadcast(json.dumps({
                            "type": "status",
                            "connected": True,
                            "port_name": ", ".join(_connected_ports),
                        }))

        # Verify ports still exist
        if _midi_inputs:
            try:
                check = rtmidi.MidiIn()
                available = set()
                for i in range(check.get_port_count()):
                    available.add(check.get_port_name(i))

                # Check if any of our connected ports disappeared
                missing = [p for p in _connected_ports if p not in available]
                if missing:
                    print(f"[Launchpad] Lost ports: {missing}", flush=True)
                    _close_all()
                    if _ws_broadcast:
                        _ws_broadcast(json.dumps({
                            "type": "status",
                            "connected": False,
                            "port_name": "",
                        }))
            except Exception:
                pass

        time.sleep(2)  # Poll every 2 seconds for connection changes


def start():
    """Start the Launchpad listener background thread."""
    global _running, _listener_thread
    if _running:
        return

    _running = True
    _listener_thread = threading.Thread(target=_listener_loop, daemon=True)
    _listener_thread.start()
    print("[Launchpad] Listener started", flush=True)


def stop():
    """Stop the listener thread."""
    global _running
    _running = False
    _close_all()
