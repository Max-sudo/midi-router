import tkinter as tk
from tkinter import ttk
import threading
import midi_routing

class MidiSplitApp(tk.Tk):
    def __init__(self):
        super().__init__()

        self.title("MIDI Split Point Selector")
        self.geometry("300x150")

        self.split_point = tk.IntVar(value=60)  # Default split point

        # Create a label
        self.label = tk.Label(self, text="Select Split Point")
        self.label.pack(pady=10)

        # Create a slider
        self.slider = ttk.Scale(self, from_=0, to=127, orient='horizontal', variable=self.split_point)
        self.slider.pack(pady=10, padx=20, fill='x')

        # Add a label to show the current split point value
        self.value_display = tk.Label(self, text=f"Selected Split Point: {self.split_point.get()}")
        self.value_display.pack(pady=10)

        # Bind the slider to the update function
        self.split_point.trace_add("write", self.update_split_point)

        # MIDI Device Selection
        self.devices = midi_routing.rtmidi.MidiIn().get_ports()
        self.device_vars = {device: {"input": tk.BooleanVar(), "output": tk.BooleanVar()} for device in self.devices}

        self.create_device_selection()

    def create_device_selection(self):
        self.device_frame = tk.Frame(self)
        self.device_frame.pack(pady=10)

        tk.Label(self.device_frame, text="Devices").grid(row=0, column=0)
        tk.Label(self.device_frame, text="Input").grid(row=0, column=1)
        tk.Label(self.device_frame, text="Output").grid(row=0, column=2)

        for i, device in enumerate(self.devices):
            tk.Label(self.device_frame, text=device).grid(row=i+1, column=0)
            tk.Checkbutton(self.device_frame, variable=self.device_vars[device]["input"], command=self.update_devices).grid(row=i+1, column=1)
            tk.Checkbutton(self.device_frame, variable=self.device_vars[device]["output"], command=self.update_devices).grid(row=i+1, column=2)

    def update_split_point(self, *args):
        split_value = self.split_point.get()
        self.value_display.config(text=f"Selected Split Point: {split_value}")

    def get_split_point(self):
        return self.split_point.get()

    def update_devices(self):
        input_devices = [midi_routing.create_device(device, midi_out=False) for device, var in self.device_vars.items() if var["input"].get()]
        output_devices = [midi_routing.create_device(device, midi_out=True) for device, var in self.device_vars.items() if var["output"].get()]

        midi_routing.update_current_devices(input_devices, output_devices)

def run_app():
    app = MidiSplitApp()
    threading.Thread(target=midi_routing.run_midi_routing, args=(app.get_split_point,), daemon=True).start()
    app.mainloop()

if __name__ == "__main__":
    run_app()
