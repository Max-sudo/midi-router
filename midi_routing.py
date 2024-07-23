import time
import rtmidi
import re

# Global variables to keep track of current input and output devices
current_inputs = []
current_outputs = []

# Function to create MIDI input or output device
def create_device(device_name, midi_out=True):
    if midi_out:
        midi = rtmidi.MidiOut()
    else:
        midi = rtmidi.MidiIn()

    midi_ports = midi.get_ports()
    # midi_ports = [re.sub(r'\s\s.*', '', midi_port).strip() for midi_port in midi_ports]

    port_dct = {v: k for k, v in enumerate(midi_ports)}
    midi.open_port(port_dct[device_name])
    return midi


def in_to_out(in_msg, split_point):
    if in_msg is not None:
        (midi_msg, dt) = in_msg
        cmd = midi_msg[0]
        new_cmd = cmd

        # Want to dynamically set this in future
        t5_channel = 0x02
        hx_channel = 0x01  

        if (cmd & 0xF0) == 0xB0:  # CC messages
            cc_number = midi_msg[1]
            new_value = midi_msg[2]
            
            if cc_number == 33:  # Filter Cutoff CC for Sequential Take 5
                new_cmd = (cmd & 0xF0) | t5_channel
                return ([new_cmd, cc_number, new_value], 0x02)
            
            elif cc_number == 1:  # Mod Wheel
                new_cmd_1 = (cmd & 0xF0) | t5_channel
                new_cmd_2 = (cmd & 0xF0) | hx_channel
                return ([new_cmd_1, cc_number, new_value], [new_cmd_2, cc_number, new_value])

            elif cc_number in range(4, 12) or cc_number in range(49, 66):  # HX FX midi CC #s and Helix CCs
                new_cmd = (cmd & 0xF0) | hx_channel
                return ([new_cmd, cc_number, new_value], hx_channel)

        elif (cmd & 0xF0) in [0x90, 0x80]:  # Note On/Off messages
            if midi_msg[1] >= split_point:
                new_cmd = (cmd & 0xF0) | t5_channel
                return ([new_cmd] + midi_msg[1:], t5_channel)
            else:
                new_cmd = (cmd & 0xF0) | 0x00
                return ([new_cmd] + midi_msg[1:], None)

        elif (cmd & 0xF0) == 0xE0:  # Pitch Bend messages
            new_cmd_1 = (cmd & 0xF0) | t5_channel
            new_cmd_2 = (cmd & 0xF0) | hx_channel
            return ([new_cmd_1] + midi_msg[1:], [new_cmd_2] + midi_msg[1:])

    return (None, None)




def send_msg_to_outs(msg, list_of_outs):
    if isinstance(msg[0], list):  # Handle pitch bend with multiple messages
        for m in msg:
            for device_out in list_of_outs:
                device_out.send_message(m)
    else:
        for device_out in list_of_outs:
            device_out.send_message(msg)

def update_current_devices(inputs, outputs):
    global current_inputs, current_outputs
    current_inputs = inputs
    current_outputs = outputs

def run_midi_routing(split_point_callback):
    while True:
        split_point = split_point_callback()  # Get the current split point from the callback
        messages = []
        for device in current_inputs:
            msg = device.get_message()
            if msg is not None:
                messages.append(msg)

        if messages:
            for msg_and_dt in messages:
                out_msg, channel = in_to_out(msg_and_dt, split_point)
                if out_msg:
                    send_msg_to_outs(out_msg, current_outputs)
                    print(f"Message sent: {out_msg} on channel {channel}")

        time.sleep(0.0001)  # Small sleep to prevent high CPU usage
