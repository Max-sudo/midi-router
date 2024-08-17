import time
import rtmidi

current_outputs = []

def create_device(device_name, midi_out=True):
    if midi_out:
        midi = rtmidi.MidiOut()
    else:
        midi = rtmidi.MidiIn()
    midi_ports = midi.get_ports()
    port_dct = {v: k for k, v in enumerate(midi_ports)}
    midi.open_port(port_dct[device_name])
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
            note = midi_msg[1]
            if note >= split_point:
                # Above the split point: Route to Take5 (or any selected "above" device)
                selected_device_channel = 0x02  # Adjust this dynamically if needed
                new_cmd = (cmd & 0xF0) | selected_device_channel
                return ([new_cmd] + midi_msg[1:], selected_device_channel)
            else:
                # Below the split point: Route to Helix (or any selected "below" device)
                selected_device_channel = 0x00  # Adjust this dynamically if needed
                new_cmd = (cmd & 0xF0) | selected_device_channel
                return ([new_cmd] + midi_msg[1:], selected_device_channel)
        else:
            # For other MIDI messages (CC, Pitch Bend), leave the channel unchanged
            return ([cmd] + midi_msg[1:], incoming_channel)

    return (None, None)



def send_msg_to_outs(msg, list_of_outs):
    if isinstance(msg[0], list):  # Handle pitch bend with multiple messages
        for m in msg:
            for device_out in list_of_outs:
                device_out.send_message(m)
    else:
        for device_out in list_of_outs:
            device_out.send_message(msg)

# Global variables to keep track of devices
current_above_split_inputs = []
current_below_split_inputs = []

def update_current_devices(above_split_inputs, below_split_inputs, outputs):
    global current_above_split_inputs, current_below_split_inputs, current_outputs
    current_above_split_inputs = above_split_inputs
    current_below_split_inputs = below_split_inputs
    current_outputs = outputs

def run_midi_routing(split_point_callback):
    while True:
        split_point = split_point_callback()
        messages = []

        # Handle messages from inputs assigned to "Above" the split point
        for device in current_above_split_inputs:
            msg = device.get_message()
            if msg is not None and msg[0][1] >= split_point:  # Only process messages above the split point
                messages.append(msg)

        # Handle messages from inputs assigned to "Below" the split point
        for device in current_below_split_inputs:
            msg = device.get_message()
            if msg is not None and msg[0][1] < split_point:  # Only process messages below the split point
                messages.append(msg)

        if messages:
            for msg_and_dt in messages:
                out_msg, channel = in_to_out(msg_and_dt, split_point)
                if out_msg:
                    send_msg_to_outs(out_msg, current_outputs)
                    print(f"Message sent: {out_msg} on channel {channel}")

        time.sleep(0.0001)

