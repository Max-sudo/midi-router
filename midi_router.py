import time
import rtmidi

####################################################
# SCRIPT GOALS: Implement flexible midi routing for all connected devices

# COMPLETE
# Step 1: Receive and send midi messages in python between two devices
# Step 2: Connect three devices

# TO-DO
# Step 3: Implment splits on different regions of midi controller
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

def in_to_out(in_msg):
    # Convert the input MIDI message for the output device
    if in_msg is not None:
        (midi_msg, dt) = in_msg
        cmd = midi_msg[0]
        # Assuming channel 1 to 3 conversion; adjust if needed
        # For example, you might need to change channels if required
        new_cmd = (cmd & 0xF0) | 0x02  # Example: Change channel to 3 (0x02 in 0-indexed)
        return [new_cmd] + midi_msg[1:]  # Preserve other parts of the message
    return None

# Create MIDI input and output devices
lk_in = create_device('Launchkey MK3 37 LKMK3 MIDI Out', midi_out=False)
sk_in = create_device('USB MIDI Device', midi_out=False)

t5_out = create_device('Take5', midi_out=True)
sk_out = create_device('USB MIDI Device', midi_out=True)

# List of input devices
input_devices = [lk_in, sk_in]

while True:
    messages = []
    for device in input_devices:
        msg = device.get_message()
        if msg is not None:
            messages.append(msg)

    if messages:
        for msg_and_dt in messages:
            out_msg = in_to_out(msg_and_dt)
            if out_msg:
                t5_out.send_message(out_msg)
                sk_out.send_message(out_msg)
                print(f"Message sent: {out_msg}")
    
    time.sleep(0.001)  # Small sleep to prevent high CPU usage
