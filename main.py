import tkinter as tk
from tkinter import ttk
import threading
import midi_routing
from ttkthemes import ThemedTk  # Import for third-party themes

class MidiSplitApp(ThemedTk):  # Use ThemedTk for theme support
    def __init__(self):
        super().__init__()

        # Set the desired theme here
        self.set_theme('arc')  # Example theme, change as needed

        self.title("MIDI Split Point Selector")
        self.geometry("300x250")  # Adjusted size to accommodate new widgets

        # Initialize split point variable
        self.split_point = tk.IntVar(value=60)  # Default split point

        # Configure style
        self.style = ttk.Style(self)
        self.style.configure("TFrame", background="#f0f0f0")  # Background color for frames
        self.style.configure("TLabel", background="#f0f0f0", foreground="#333333")  # Text color for labels
        self.style.configure("TScale", background="#ffffff")  # Background color for scale

        # Create UI elements
        self.create_ui()

    def create_ui(self):
        # Create a banner at the top
        banner_frame = ttk.Frame(self, padding="10")
        banner_frame.pack(fill='x', padx=10, pady=10)

        banner_label = ttk.Label(banner_frame, text="Midi-Router", font=("Helvetica", 16, "bold"))
        banner_label.pack()

        # Create a frame for the device selection
        self.device_frame = ttk.Frame(self, padding="10")
        self.device_frame.pack(pady=10, fill='x')

        ttk.Label(self.device_frame, text="Devices").grid(row=0, column=0, padx=5, pady=5)
        ttk.Label(self.device_frame, text="Input").grid(row=0, column=1, padx=5, pady=5)
        ttk.Label(self.device_frame, text="Output").grid(row=0, column=2, padx=5, pady=5)

        self.devices = midi_routing.rtmidi.MidiIn().get_ports()
        self.device_vars = {device: {"input": tk.BooleanVar(), "output": tk.BooleanVar()} for device in self.devices}

        for i, device in enumerate(self.devices):
            ttk.Label(self.device_frame, text=device).grid(row=i+1, column=0, padx=5, pady=5)
            ttk.Checkbutton(self.device_frame, variable=self.device_vars[device]["input"], command=self.update_devices).grid(row=i+1, column=1, padx=5, pady=5)
            ttk.Checkbutton(self.device_frame, variable=self.device_vars[device]["output"], command=self.update_devices).grid(row=i+1, column=2, padx=5, pady=5)

        # Create a frame for the split point section
        split_point_frame = ttk.Frame(self, padding="10")
        split_point_frame.pack(side='bottom', fill='x', padx=10, pady=10)

        # Create a label for split point
        self.label = ttk.Label(split_point_frame, text="Select Split Point")
        self.label.pack(pady=5)

        # Create a slider
        self.slider = ttk.Scale(split_point_frame, from_=0, to=127, orient='horizontal', variable=self.split_point)
        self.slider.pack(pady=5, fill='x')

        # Add a label to show the current split point value
        self.value_display = ttk.Label(split_point_frame, text=f"Selected Split Point: {self.split_point.get()}")
        self.value_display.pack(pady=5)

        # Bind the slider to the update function
        self.split_point.trace_add("write", self.update_split_point)

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
