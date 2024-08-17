import time
import rtmidi
import re
print(1)
# Global variables to keep track of current input and output devices
current_inputs = []
current_outputs = []
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