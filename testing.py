import time
import rtmidi
import re
print(1)
# Global variables to keep track of current input and output devices
current_inputs = []
current_outputs = []

midi_out=False
if midi_out:
    midi = rtmidi.MidiOut()
else:
    midi = rtmidi.MidiIn()
midi_ports = midi.get_ports()
print(midi_ports)