import tkinter as tk
from tkinter import ttk
import threading
import midi_routing
import rtmidi

class MidiSplitApp(tk.Tk):
    def __init__(self):
        super().__init__()

        self.title("MIDI Split Point Selector")
        self.geometry("400x300")

        self.split_point = tk.IntVar(value=60)  # Default split point
        self.selected_inputs = []
        self.selected_outputs = {}

        self.create_widgets()
        self.update_instruments_list()

    def create_widgets(self):
        # Split point slider
        self.label = tk.Label(self, text="Select Split Point")
        self.label.pack(pady=10)

        self.slider = ttk.Scale(self, from_=0, to=127, orient='horizontal', variable=self.split_point)
        self.slider.pack(pady=10, padx=20, fill='x')

        self.value_display = tk.Label(self, text=f"Selected Split Point: {self.split_point.get()}")
        self.value_display.pack(pady=10)

        self.split_point.trace_add("write", self.update_split_point)

        # Instrument list
        self.instruments_frame = tk.Frame(self)
        self.instruments_frame.pack(pady=10)

        # Labels for input and output columns
        self.instruments_label = tk.Label(self.instruments_frame, text="Instruments")
        self.instruments_label.grid(row=0, column=0)

        self.input_label = tk.Label(self.instruments_frame, text="Input")
        self.input_label.grid(row=0, column=1)

        self.output_label = tk.Label(self.instruments_frame, text="Output")
        self.output_label.grid(row=0, column=2)

        self.instruments_listbox = tk.Listbox(self.instruments_frame, selectmode=tk.SINGLE, height=10)
        self.instruments_listbox.grid(row=1, column=0, rowspan=10)

        self.input_checkbuttons = []
        self.output_checkbuttons = []

        self.input_var = {}
        self.output_vars = {}

    def update_split_point(self, *args):
        split_value = self.split_point.get()
        self.value_display.config(text=f"Selected Split Point: {split_value}")

    def get_split_point(self):
        return self.split_point.get()

    def update_instruments_list(self):
        midi = rtmidi.MidiIn()
        ports = midi.get_ports()
        
        self.instruments_listbox.delete(0, tk.END)
        for port in ports:
            self.instruments_listbox.insert(tk.END, port)

        for i, port in enumerate(ports):
            input_var = tk.StringVar()
            input_checkbutton = ttk.Checkbutton(self.instruments_frame, variable=input_var,
                                                command=lambda p=port, v=input_var: self.select_input(p, v))
            input_checkbutton.grid(row=i+1, column=1)
            self.input_checkbuttons.append(input_checkbutton)
            self.input_var[port] = input_var

            output_var = tk.StringVar()
            output_checkbutton = ttk.Checkbutton(self.instruments_frame, variable=output_var,
                                                 command=lambda p=port, v=output_var: self.select_output(p, v))
            output_checkbutton.grid(row=i+1, column=2)
            self.output_checkbuttons.append(output_checkbutton)
            self.output_vars[port] = output_var

    def select_input(self, port, var):
        if var.get() == "1":
            if port not in self.selected_inputs:
                self.selected_inputs.append(port)
        else:
            if port in self.selected_inputs:
                self.selected_inputs.remove(port)
        midi_routing.update_input_devices(self.selected_inputs)

    def select_output(self, port, var):
        if var.get() == "1":
            self.selected_outputs[port] = True
        else:
            if port in self.selected_outputs:
                del self.selected_outputs[port]
        midi_routing.update_output_devices(self.selected_outputs)

def run_app():
    app = MidiSplitApp()
    threading.Thread(target=midi_routing.run_midi_routing, args=(app.get_split_point, app.selected_inputs, app.selected_outputs), daemon=True).start()
    app.mainloop()

if __name__ == "__main__":
    run_app()
