#!/usr/bin/env python3
import tkinter as tk
from tkinter import ttk
import threading
import midi_routing
from ttkthemes import ThemedTk  # Import for third-party themes

class MidiSplitApp(ThemedTk):
    def __init__(self):
        super().__init__()
        self.set_theme('arc')
        self.title("MIDI Split Point Selector")
        self.geometry("350x300")  # Adjust size for additional widgets
        self.split_point = tk.IntVar(value=60)
        self.style = ttk.Style(self)
        self.style.configure("TFrame", background="#f0f0f0")
        self.style.configure("TLabel", background="#f0f0f0", foreground="#333333")
        self.style.configure("TScale", background="#ffffff")
        self.create_ui()

    def create_ui(self):
        banner_frame = ttk.Frame(self, padding="10")
        banner_frame.pack(fill='x', padx=10, pady=10)
        banner_label = ttk.Label(banner_frame, text="Midi-Router", font=("Helvetica", 16, "bold"))
        banner_label.pack()

        self.device_frame = ttk.Frame(self, padding="10")
        self.device_frame.pack(pady=10, fill='x')

        # Update the column labels to include separate "Above" and "Below" headers
        ttk.Label(self.device_frame, text="Devices").grid(row=0, column=0, padx=5, pady=5)
        ttk.Label(self.device_frame, text="Send").grid(row=0, column=1, padx=5, pady=5)
        ttk.Label(self.device_frame, text="Receive").grid(row=0, column=2, padx=5, pady=5)
        ttk.Label(self.device_frame, text="Above").grid(row=0, column=3, padx=5, pady=5)  # New column for Above
        ttk.Label(self.device_frame, text="Below").grid(row=0, column=4, padx=5, pady=5)  # New column for Below

        input_devices = [d for d in midi_routing.rtmidi.MidiIn().get_ports() if 'HUI' not in d]
        output_devices = [d for d in midi_routing.rtmidi.MidiOut().get_ports() if 'HUI' not in d]
        self.device_vars = {device: {"input": tk.BooleanVar(), "output": tk.BooleanVar(), "above": tk.BooleanVar(), "below": tk.BooleanVar()} for device in sorted(set(input_devices + output_devices))}

        for i, device in enumerate(self.device_vars.keys()):
            ttk.Label(self.device_frame, text=device).grid(row=i+1, column=0, padx=5, pady=5)

            if device in input_devices:
                ttk.Checkbutton(self.device_frame, variable=self.device_vars[device]["input"], command=self.update_devices).grid(row=i+1, column=1, padx=5, pady=5)
                ttk.Checkbutton(self.device_frame, variable=self.device_vars[device]["above"], command=self.update_devices).grid(row=i+1, column=3, padx=5, pady=5)  # Above column
                ttk.Checkbutton(self.device_frame, variable=self.device_vars[device]["below"], command=self.update_devices).grid(row=i+1, column=4, padx=5, pady=5)  # Below column

            if device in output_devices:
                ttk.Checkbutton(self.device_frame, variable=self.device_vars[device]["output"], command=self.update_devices).grid(row=i+1, column=2, padx=5, pady=5)

        split_point_frame = ttk.Frame(self, padding="10")
        split_point_frame.pack(side='bottom', fill='x', padx=10, pady=10)
        self.label = ttk.Label(split_point_frame, text="Select Split Point")
        self.label.pack(pady=5)
        self.slider = ttk.Scale(split_point_frame, from_=0, to=127, orient='horizontal', variable=self.split_point)
        self.slider.pack(pady=5, fill='x')
        self.value_display = ttk.Label(split_point_frame, text=f"Selected Split Point: {self.split_point.get()}")
        self.value_display.pack(pady=5)
        self.split_point.trace_add("write", self.update_split_point)

    def update_split_point(self, *args):
        split_value = self.split_point.get()
        self.value_display.config(text=f"Selected Split Point: {split_value}")

    def get_split_point(self):
        return self.split_point.get()

    def update_devices(self):
        above_split_inputs = [midi_routing.create_device(device, midi_out=False) for device, var in self.device_vars.items() if var["input"].get() and var["above"].get()]
        below_split_inputs = [midi_routing.create_device(device, midi_out=False) for device, var in self.device_vars.items() if var["input"].get() and var["below"].get()]
        outputs = [midi_routing.create_device(device, midi_out=True) for device, var in self.device_vars.items() if var["output"].get()]
    
        midi_routing.update_current_devices(above_split_inputs, below_split_inputs, outputs)


def run_app():
    app = MidiSplitApp()
    threading.Thread(target=midi_routing.run_midi_routing, args=(app.get_split_point,), daemon=True).start()
    app.mainloop()

if __name__ == "__main__":
    run_app()
