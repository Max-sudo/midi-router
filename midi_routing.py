import time
import rtmidi
import queue
import threading

# Thread-safe queue for incoming MIDI events (device_name, (message, dt))
message_queue = queue.Queue()

# Lock to protect access to shared device/output lists
devices_lock = threading.Lock()
current_outputs = []
current_inputs = []  # held to keep MidiIn objects alive (and their callbacks active)
# Mapping: device_name -> role ('above' or 'below')
current_input_roles = {}


def create_device(device_name, midi_out=True):
    if midi_out:
        midi = rtmidi.MidiOut()
    else:
        midi = rtmidi.MidiIn()
    midi_ports = midi.get_ports()
    port_dct = {v: k for k, v in enumerate(midi_ports)}
    if device_name not in port_dct:
        raise ValueError(f"MIDI port '{device_name}' not found")
    midi.open_port(port_dct[device_name])

    # For inputs, set a callback that enqueues messages
    if not midi_out:
        def _midi_in_callback(event, data=None):
            # event is (message, delta_time)
            print(f"[CALLBACK] {device_name}: {event}")
            try:
                message_queue.put((device_name, event))
            except Exception as e:
                print(f"[CALLBACK ERROR] {e}")

        midi.set_callback(_midi_in_callback)

    return midi


def in_to_out(in_msg, split_point):
    if in_msg is not None:
        (midi_msg, dt) = in_msg
        cmd = midi_msg[0]
        new_cmd = cmd

        # Extract the MIDI channel from the incoming message
        incoming_channel = cmd & 0x0F

        # Determine the device to route based on the split point and input device selection
        if (cmd & 0xF0) == 0x90 or (cmd & 0xF0) == 0x80:  # Note On/Off messages
            # Safely access note value
            if len(midi_msg) < 2:
                return (None, None)
            note = midi_msg[1]
            if note >= split_point:
                selected_device_channel = 0x02
                new_cmd = (cmd & 0xF0) | selected_device_channel
                return ([new_cmd] + midi_msg[1:], selected_device_channel)
            else:
                selected_device_channel = 0x00
                new_cmd = (cmd & 0xF0) | selected_device_channel
                return ([new_cmd] + midi_msg[1:], selected_device_channel)
        else:
            # For other MIDI messages (CC, Pitch Bend), leave the channel unchanged
            return ([cmd] + midi_msg[1:], incoming_channel)

    return (None, None)


def send_msg_to_outs(msg, list_of_outs):
    if not list_of_outs:
        return
    if isinstance(msg[0], list):  # Handle pitch bend with multiple messages
        for m in msg:
            for device_out in list_of_outs:
                try:
                    device_out.send_message(m)
                except Exception:
                    pass
    else:
        for device_out in list_of_outs:
            try:
                device_out.send_message(msg)
            except Exception:
                pass


def update_current_devices(above_split_inputs, below_split_inputs, outputs):
    """
    above_split_inputs / below_split_inputs: list of (device_name, MidiIn) tuples
    outputs: list of MidiOut objects
    """
    global current_outputs, current_inputs, current_input_roles
    with devices_lock:
        current_outputs = outputs
        # Keep MidiIn objects alive so their callbacks remain active
        current_inputs = [dev for _, dev in above_split_inputs + below_split_inputs]

        roles = {}
        for name, _ in above_split_inputs:
            roles[name] = 'above'
        for name, _ in below_split_inputs:
            roles[name] = 'below'
        current_input_roles = roles


def run_midi_routing(split_point_callback):
    while True:
        try:
            device_name, event = message_queue.get(timeout=0.1)
        except queue.Empty:
            continue

        (midi_msg, dt) = event
        split_point = split_point_callback()

        with devices_lock:
            role = current_input_roles.get(device_name)
            outs = list(current_outputs)

        if role is None:
            continue

        # If it's a note message, apply split filtering based on role
        cmd = midi_msg[0]
        if (cmd & 0xF0) == 0x90 or (cmd & 0xF0) == 0x80:
            if len(midi_msg) < 2:
                continue
            note = midi_msg[1]
            if role == 'above' and note < split_point:
                continue
            if role == 'below' and note >= split_point:
                continue

        out_msg, channel = in_to_out((midi_msg, dt), split_point)
        if out_msg:
            send_msg_to_outs(out_msg, outs)
            print(f"Message sent: {out_msg} on channel {channel}")


