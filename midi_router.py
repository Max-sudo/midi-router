import time
import rtmidi

####################################################
# SCRIPT GOALS: Implement flexible midi routing for all connected devices

# COMPLETE
# Step 1: Receive and send midi messages in python between two devices
# Step 2: Connect three devices
# Step 3: Implment splits on different regions of midi controller

# TO-DO

####################################################

# Function to create MIDI input or output device
def create_device(device_name, midi_out=True):
    if midi_out:
        midi = rtmidi.MidiOut()
    else:
        midi = rtmidi.MidiIn()

    midi_ports = midi.get_ports()
    port_dct = {v: k for k, v in enumerate(midi_ports)}
    midi.open_port(port_dct[device_name])
    return midi

def in_to_out(in_msg, split_point=60):
    # Convert the input MIDI message for the output device
    if in_msg is not None:
        (midi_msg, dt) = in_msg
        cmd = midi_msg[0]
        print(cmd)
        # Channel conversion - with respecft to split_point
        # Set as static dct for now but this is where user would set values w/ UI
        if midi_msg[1] >= split_point:
            new_cmd = (cmd & 0xF0) | 0x02  # Change channel to 3 (0x02 in 0-indexed)
        else: 
            new_cmd = (cmd & 0xF0) | 0x00
        return [new_cmd] + midi_msg[1:]  # Preserve other parts of the message
    return None

def send_msg_to_outs(msg, list_of_outs):
    for device_out in list_of_outs:
        device_out.send_message(msg)

# Create MIDI input and output devices
lk_in = create_device('Launchkey MK3 37 LKMK3 MIDI Out', midi_out=False)
# t5_in = create_device('Take5', midi_out=False)
# sk_in = create_device('HAMMOND SK PRO', midi_out=False)

t5_out = create_device('Take5', midi_out=True)
sk_out = create_device('HAMMOND SK PRO', midi_out=True)

# List of input devices
input_devices = [lk_in]
output_devices = [sk_out, t5_out]

while True:
    messages = []
    for device in input_devices:
        msg = device.get_message()
        if msg is not None:
            messages.append(msg)

    if messages:
        for msg_and_dt in messages:
            out_msg = in_to_out(msg_and_dt, split_point=60) # middle c?
            if out_msg:
                send_msg_to_outs(out_msg, output_devices)
                print(f"Message sent: {out_msg}")
    
    time.sleep(0.001)  # Small sleep to prevent high CPU usage
