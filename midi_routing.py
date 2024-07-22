import time
import rtmidi
import re

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
    # Convert the input MIDI message for the output device
    if in_msg is not None:
        (midi_msg, dt) = in_msg
        cmd = midi_msg[0]

        # Check if the message is a CC message
        if (cmd & 0xF0) == 0xB0:  # CC messages have 0xB0 in their command byte
            cc_number = midi_msg[1]
            if cc_number == 33:  # Filter Cutoff CC for Sequential Take 5
                new_value = midi_msg[2]  # The new value for the parameter
                t5_channel = 0x02
                new_cmd = (cmd & 0xF0) | t5_channel  # Change channel to 3 (0x02 in 0-indexed)
                return [new_cmd, cc_number, new_value], t5_channel
            
            elif cc_number in [4, 5, 6, 7, 8, 9, 10, 11]:  # HX FX midi CC #s
                new_value = midi_msg[2]  # The new value for the parameter
                channel = 0x01
                new_cmd = (cmd & 0xF0) | channel  # Change channel to 2 (0x01 in 0-indexed)
                return [new_cmd, cc_number, new_value], channel+1

        # If message is note data
        if (cmd & 0xF0) in [0x90, 0x80]:
            # Channel conversion - with respect to split_point
            if midi_msg[1] >= split_point:
                new_cmd = (cmd & 0xF0) | 0x02  # Change channel to 3 (0x02 in 0-indexed)
            else:
                new_cmd = (cmd & 0xF0) | 0x00

        return [new_cmd] + midi_msg[1:], None  # Preserve other parts of the message
        
    return None

def send_msg_to_outs(msg, list_of_outs):
    for device_out in list_of_outs:
        device_out.send_message(msg)

def update_input_devices(input_devices):
    global current_inputs
    current_inputs = [create_device(device, midi_out=False) for device in input_devices]

def update_output_devices(output_devices):
    global current_outputs
    current_outputs = [create_device(device, midi_out=True) for device in output_devices]

def run_midi_routing(split_point_callback, input_devices_callback, output_devices_callback):
    global current_inputs, current_outputs
    current_inputs = []
    current_outputs = []

    while True:
        split_point = split_point_callback()  # Get the current split point from the callback
        # input_devices = input_devices_callback  # Get the current input devices from the callback
        # output_devices = output_devices_callback  # Get the current output devices from the callback

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
