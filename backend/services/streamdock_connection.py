# ── Stream Dock N1 direct USB/HID connection ────────────────────────
#
# Talks directly to the N1 hardware via HID (no Stream Dock desktop app).
# Protocol reverse-engineered from:
#   - MiraboxSpace/StreamDock-Device-SDK (official Python SDK)
#   - rigor789/mirabox-streamdock-node (community RE)
#   - bitfocus/companion-surface-mirabox-stream-dock
#
from __future__ import annotations
import io
import json
import struct
import threading
import time
from pathlib import Path
from typing import Callable

try:
    import hid
    _hid_available = True
except ImportError:
    hid = None
    _hid_available = False

try:
    from PIL import Image
    _pil_available = True
except ImportError:
    Image = None
    _pil_available = False

from . import streamdock_mappings
from . import streamdock_actions

# ── Device identifiers ────────────────────────────────────────────
# N1 can appear under multiple VID/PID combos (firmware versions)
N1_USB_IDS = [
    (0x6603, 0x1011),  # N1 primary (from official SDK)
    (0x6603, 0x1000),  # N1 alternate (from official SDK)
]

# ── Protocol constants ────────────────────────────────────────────
CRT_PREFIX = bytes([0x43, 0x52, 0x54, 0x00, 0x00])  # "CRT\x00\x00"
CRT_BAT    = bytes([0x42, 0x41, 0x54])  # Set key image
CRT_LIG    = bytes([0x4C, 0x49, 0x47, 0x00, 0x00])  # Brightness
CRT_DIS    = bytes([0x44, 0x49, 0x53, 0x00, 0x00])  # Wake screen
CRT_CLE    = bytes([0x43, 0x4C, 0x45, 0x00, 0x00])  # Clear
CRT_STP    = bytes([0x53, 0x54, 0x50, 0x00, 0x00])  # Refresh

PACKET_SIZE = 512  # All packets padded to this size
KEY_IMAGE_SIZE = 96  # 96×96 pixels (official SDK) or 100×100 (community RE)
KEY_IMAGE_QUALITY = 90

# Hardware key code → button index (0-14)
# SDK: hardware codes 0x01-0x0F map to keys; the exact mapping depends on
# physical layout. The N1 SDK uses a direct 1:1 map for keys 1-15.
# rigor789 found a shuffled KEY_MAP for the 293 model.
# We support both: try the N1 direct map first, fall back to 293 map.
N1_KEY_MAP = {i: i - 1 for i in range(1, 16)}  # 1→0, 2→1, ..., 15→14

# ── Module state ──────────────────────────────────────────────────
_ws_broadcast: Callable | None = None
_listener_thread: threading.Thread | None = None
_running = False
_connected = False
_device = None  # hid.Device instance
_device_path: bytes | None = None

N1_BUTTON_COUNT = 15
N1_COLUMNS = 3
N1_ROWS = 5

_ICON_DIR = Path(__file__).parent.parent / "streamdock_icons"


def set_ws_broadcast(callback: Callable):
    global _ws_broadcast
    _ws_broadcast = callback


def get_status() -> dict:
    return {
        "connected": _connected,
        "listener_running": _running,
        "device_name": "Stream Dock N1" if _connected else "",
    }


# ── Protocol helpers ──────────────────────────────────────────────

def _pad(data: bytes, size: int = PACKET_SIZE) -> bytes:
    """Pad data to exactly `size` bytes."""
    if len(data) >= size:
        return data[:size]
    return data + b'\x00' * (size - len(data))


def _send_command(cmd: bytes):
    """Send a CRT command to the device."""
    if not _device:
        return
    packet = _pad(CRT_PREFIX + cmd)
    # HID write: prepend report ID 0x00
    _device.write(b'\x00' + packet)


def _send_raw(data: bytes):
    """Send raw data (image chunks) to the device."""
    if not _device:
        return
    packet = _pad(data)
    _device.write(b'\x00' + packet)


def _wake_screen():
    _send_command(CRT_DIS)


def _clear_screen():
    _send_command(CRT_CLE + bytes([0x00, 0xFF]))  # 0xFF = full screen


def _refresh():
    _send_command(CRT_STP)


def set_brightness(percent: int):
    """Set screen brightness (0-100)."""
    val = max(0, min(100, percent))
    _send_command(CRT_LIG + bytes([val]))


def _prepare_image(image_path: str) -> bytes:
    """Load an image, resize to KEY_IMAGE_SIZE×KEY_IMAGE_SIZE, rotate 180°,
    encode as JPEG, and return the bytes."""
    if not _pil_available:
        return b''
    img = Image.open(image_path).convert('RGB')
    img = img.resize((KEY_IMAGE_SIZE, KEY_IMAGE_SIZE), Image.LANCZOS)
    img = img.rotate(180)
    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=KEY_IMAGE_QUALITY)
    return buf.getvalue()


def set_button_image(button_index: int, image_path: str):
    """Send a 96×96 image to a button on the device."""
    if not _device or not _connected:
        return
    if button_index < 0 or button_index >= N1_BUTTON_COUNT:
        return

    try:
        jpeg_data = _prepare_image(image_path)
        if not jpeg_data:
            return

        # SDK key = button_index + 1
        sdk_key = button_index + 1

        # CRT_BAT header: [0x42, 0x41, 0x54, size(4 bytes big-endian), key_id]
        size_bytes = struct.pack('>I', len(jpeg_data))
        header = CRT_BAT + size_bytes + bytes([sdk_key])
        _send_command(header)

        # Send JPEG data in PACKET_SIZE chunks
        offset = 0
        while offset < len(jpeg_data):
            chunk = jpeg_data[offset:offset + PACKET_SIZE]
            _send_raw(chunk)
            offset += PACKET_SIZE

        _refresh()

    except Exception as e:
        print(f"[StreamDock] Set image failed for button {button_index}: {e}", flush=True)


def update_all_button_images():
    """Push icons for all mapped buttons to the device."""
    if not _device or not _connected:
        return
    all_mappings = streamdock_mappings.get_all_mappings()
    for index_str, action in all_mappings.items():
        icon = action.get("icon", "")
        if icon:
            icon_path = _ICON_DIR / icon
            if icon_path.exists():
                set_button_image(int(index_str), str(icon_path))


# ── Key press handling ────────────────────────────────────────────

def _decode_key_press(data: bytes) -> tuple[int, int] | None:
    """Decode an HID input report into (button_index, state).
    Returns None if the report isn't a key event."""
    if len(data) < 11:
        return None

    hw_key = data[9]
    state = data[10]  # 0x01=press, 0x02=release

    button_index = N1_KEY_MAP.get(hw_key)
    if button_index is None:
        return None

    return (button_index, 1 if state == 0x01 else 0)


def _on_key_press(button_index: int):
    """Handle a button press (state=1)."""
    action = streamdock_mappings.get_mapping(button_index)

    # Broadcast to browser
    if _ws_broadcast:
        event_data = {
            "type": "button_press",
            "button_index": button_index,
            "has_mapping": action is not None,
            "label": action.get("label", "") if action else "",
        }
        try:
            _ws_broadcast(json.dumps(event_data))
        except Exception:
            pass

    # Execute action
    if action:
        print(f"[StreamDock] Executing: {action.get('action_type')} for button {button_index} — {action.get('label', '')}", flush=True)
        result = streamdock_actions.execute(action)
        if result["success"]:
            print(f"[StreamDock] Action OK for button {button_index}", flush=True)
        else:
            print(f"[StreamDock] Action FAILED for button {button_index}: {result['error']}", flush=True)


# ── Device discovery & connection ────────────────────────────────

def _find_device() -> bytes | None:
    """Scan HID devices for a Stream Dock N1. Returns device path or None."""
    if not _hid_available:
        return None

    for vid, pid in N1_USB_IDS:
        for dev_info in hid.enumerate(vid, pid):
            # Return the first matching device path
            return dev_info['path']

    return None


def _open_device(path: bytes) -> bool:
    """Open the HID device at the given path."""
    global _device, _device_path, _connected

    try:
        _device = hid.Device(path=path)
        _device_path = path
        _connected = True

        # Initialize the device
        _wake_screen()
        time.sleep(0.1)
        set_brightness(50)

        print(f"[StreamDock] Connected to N1", flush=True)
        return True

    except Exception as e:
        print(f"[StreamDock] Failed to open device: {e}", flush=True)
        _device = None
        _device_path = None
        _connected = False
        return False


def _close_device():
    """Close the HID device."""
    global _device, _device_path, _connected
    if _device:
        try:
            _device.close()
        except Exception:
            pass
        _device = None
    _device_path = None
    _connected = False


# ── Main listener loop ───────────────────────────────────────────

def _listener_loop():
    """Background thread: find device, read key presses, reconnect on disconnect."""
    global _running

    if not _hid_available:
        print("[StreamDock] hidapi not installed — listener disabled", flush=True)
        print("[StreamDock] Install with: pip install hidapi", flush=True)
        return

    while _running:
        # Try to connect if not connected
        if not _connected:
            path = _find_device()
            if path:
                if _open_device(path):
                    if _ws_broadcast:
                        _ws_broadcast(json.dumps({"type": "status", "connected": True}))
                    update_all_button_images()
                else:
                    time.sleep(3)
                    continue
            else:
                time.sleep(3)
                continue

        # Read input reports (non-blocking with timeout)
        try:
            data = _device.read(64, timeout=100)  # 100ms timeout
            if data:
                result = _decode_key_press(bytes(data))
                if result:
                    button_index, state = result
                    if state == 1:  # press only
                        _on_key_press(button_index)

        except Exception as e:
            print(f"[StreamDock] Read error (device disconnected?): {e}", flush=True)
            _close_device()
            if _ws_broadcast:
                try:
                    _ws_broadcast(json.dumps({"type": "status", "connected": False}))
                except Exception:
                    pass
            time.sleep(1)


def start():
    """Start the Stream Dock listener background thread."""
    global _running, _listener_thread
    if _running:
        return

    _ICON_DIR.mkdir(exist_ok=True)
    _running = True
    _listener_thread = threading.Thread(target=_listener_loop, daemon=True)
    _listener_thread.start()
    print("[StreamDock] Listener started", flush=True)


def stop():
    """Stop the listener thread and close the device."""
    global _running
    _running = False
    _close_device()
