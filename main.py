#!/usr/bin/env python3
import json
import tkinter as tk
from tkinter import messagebox
import customtkinter as ctk
import threading
from pathlib import Path
import midi_routing

ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("blue")

class MidiSplitApp(ctk.CTk):
    def __init__(self, input_devices, output_devices):
        super().__init__()
        self.title("MIDI Router")
        self.minsize(420, 300)
        self.split_point = tk.IntVar(value=60)
        self.create_ui(input_devices, output_devices)
        # Restore last used preset (checkboxes + dropdown selection)
        last = self._load_last_used()
        if last:
            self._apply_preset(last)
            self._preset_var.set(last)
        # Auto-size window to fit content so no labels are clipped
        self.update_idletasks()
        self.geometry(f"{self.winfo_reqwidth()}x{self.winfo_reqheight()}")
        # Bring window to front on macOS (Python apps don't steal focus by default)
        self.after(100, self._bring_to_front)

    def _bring_to_front(self):
        self.lift()
        self.attributes('-topmost', True)
        self.after(100, lambda: self.attributes('-topmost', False))

    # ------------------------------------------------------------------
    # Preset helpers
    # ------------------------------------------------------------------

    def _preset_path(self):
        return Path.home() / ".midi_router_presets.json"

    def _load_presets(self):
        try:
            data = json.loads(self._preset_path().read_text())
            data.pop("__last_used__", None)
            return data
        except (FileNotFoundError, json.JSONDecodeError):
            return {}

    def _load_last_used(self):
        try:
            return json.loads(self._preset_path().read_text()).get("__last_used__")
        except (FileNotFoundError, json.JSONDecodeError):
            return None

    def _save_presets(self, presets, last_used=None):
        data = dict(presets)
        if last_used is None:
            last_used = self._load_last_used()
        if last_used and last_used in presets:
            data["__last_used__"] = last_used
        self._preset_path().write_text(json.dumps(data, indent=2))

    def _refresh_dropdown(self, presets, select=None):
        names = sorted(presets.keys())
        if names:
            self._preset_menu.configure(values=names)
            self._preset_var.set(select if select in names else names[0])
        else:
            self._preset_menu.configure(values=["No presets saved"])
            self._preset_var.set("No presets saved")

    def _apply_preset(self, name):
        presets = self._load_presets()
        preset = presets.get(name, {})
        for device, vars_ in self.device_vars.items():
            state = preset.get(device, {})
            vars_["input"].set(state.get("input", False))
            vars_["output"].set(state.get("output", False))
        self.update_devices()
        self._save_presets(presets, last_used=name)

    def _save_current_preset(self):
        dialog = ctk.CTkInputDialog(text="Enter preset name:", title="Save Preset")
        name = dialog.get_input()
        if not name:
            return
        presets = self._load_presets()
        presets[name] = {
            device: {"input": vars_["input"].get(), "output": vars_["output"].get()}
            for device, vars_ in self.device_vars.items()
        }
        self._save_presets(presets)
        self._refresh_dropdown(presets, select=name)

    def _delete_preset(self):
        name = self._preset_var.get()
        presets = self._load_presets()
        if name not in presets:
            return
        if not messagebox.askyesno("Delete Preset", f"Delete \"{name}\"?", icon="warning"):
            return
        del presets[name]
        self._save_presets(presets)
        self._refresh_dropdown(presets)
        if not presets:
            for vars_ in self.device_vars.values():
                vars_["input"].set(False)
                vars_["output"].set(False)
            self.update_devices()

    # ------------------------------------------------------------------
    # UI
    # ------------------------------------------------------------------

    def create_ui(self, input_devices, output_devices):
        # Header
        header_frame = ctk.CTkFrame(self, fg_color="transparent")
        header_frame.pack(fill='x', padx=20, pady=(20, 5))
        ctk.CTkLabel(header_frame, text="MIDI Router", font=ctk.CTkFont(size=22, weight="bold")).pack()

        # Preset bar
        preset_frame = ctk.CTkFrame(self, fg_color="transparent")
        preset_frame.pack(fill='x', padx=20, pady=(0, 5))
        self._preset_var = tk.StringVar(value="No presets saved")
        self._preset_menu = ctk.CTkOptionMenu(
            preset_frame,
            variable=self._preset_var,
            values=["No presets saved"],
            command=self._apply_preset,
            width=200,
        )
        self._preset_menu.pack(side='left', padx=(0, 8))
        ctk.CTkButton(preset_frame, text="Save", width=60, command=self._save_current_preset).pack(side='left', padx=(0, 8))
        ctk.CTkButton(preset_frame, text="Delete", width=60, fg_color="#c0392b", hover_color="#922b21", command=self._delete_preset).pack(side='left')
        self._refresh_dropdown(self._load_presets())

        # Device list
        self.device_frame = ctk.CTkFrame(self)

        self.device_frame.pack(padx=20, pady=10, fill='both', expand=True)
        self.device_frame.columnconfigure(0, weight=1, minsize=200)
        self.device_frame.columnconfigure(1, minsize=70)
        self.device_frame.columnconfigure(2, minsize=70)

        # Column headers
        ctk.CTkLabel(self.device_frame, text="Device", font=ctk.CTkFont(weight="bold"), anchor='w').grid(row=0, column=0, padx=(15, 5), pady=(12, 6), sticky='w')
        ctk.CTkLabel(self.device_frame, text="Send", font=ctk.CTkFont(weight="bold")).grid(row=0, column=1, pady=(12, 6))
        ctk.CTkLabel(self.device_frame, text="Receive", font=ctk.CTkFont(weight="bold")).grid(row=0, column=2, pady=(12, 6))

        self.device_vars = {device: {"input": tk.BooleanVar(), "output": tk.BooleanVar(), "above": tk.BooleanVar(), "below": tk.BooleanVar()} for device in sorted(set(input_devices + output_devices))}

        for i, device in enumerate(self.device_vars.keys()):
            row = i + 1
            ctk.CTkLabel(self.device_frame, text=device, anchor='w').grid(row=row, column=0, padx=(15, 5), pady=6, sticky='w')

            if device in input_devices:
                ctk.CTkCheckBox(self.device_frame, text="", width=24, checkbox_width=24, checkbox_height=24, variable=self.device_vars[device]["input"], command=self.update_devices).grid(row=row, column=1, pady=6)

            if device in output_devices:
                ctk.CTkCheckBox(self.device_frame, text="", width=24, checkbox_width=24, checkbox_height=24, variable=self.device_vars[device]["output"], command=self.update_devices).grid(row=row, column=2, pady=6)

        # Split point UI — hidden for now, re-enable by calling .pack() on split_point_frame
        self.split_point_frame = ctk.CTkFrame(self)
        ctk.CTkLabel(self.split_point_frame, text="Split Point").pack(pady=5)
        self.slider = ctk.CTkSlider(self.split_point_frame, from_=0, to=127, variable=self.split_point, command=self.update_split_point)
        self.slider.pack(pady=5, fill='x', padx=10)
        self.value_display = ctk.CTkLabel(self.split_point_frame, text=f"Selected: {self.split_point.get()}")
        self.value_display.pack(pady=5)

    def update_split_point(self, value):
        self.value_display.configure(text=f"Selected: {int(value)}")

    def get_split_point(self):
        return self.split_point.get()

    def update_devices(self):
        above_split_inputs = [midi_routing.create_device(device, midi_out=False) for device, var in self.device_vars.items() if var["input"].get() and var["above"].get()]
        below_split_inputs = [midi_routing.create_device(device, midi_out=False) for device, var in self.device_vars.items() if var["input"].get() and var["below"].get()]
        outputs = [midi_routing.create_device(device, midi_out=True) for device, var in self.device_vars.items() if var["output"].get()]
        midi_routing.update_current_devices(above_split_inputs, below_split_inputs, outputs)


def run_app():
    # Query MIDI ports before creating the CTk window to avoid a GIL/AppKit conflict
    # that occurs when rtmidi (CoreMIDI) and customtkinter (AppKit) both initialize on the main thread.
    input_devices = [d for d in midi_routing.rtmidi.MidiIn().get_ports() if 'HUI' not in d]
    output_devices = [d for d in midi_routing.rtmidi.MidiOut().get_ports() if 'HUI' not in d]
    app = MidiSplitApp(input_devices, output_devices)
    threading.Thread(target=midi_routing.run_midi_routing, args=(app.get_split_point,), daemon=True).start()
    app.mainloop()

if __name__ == "__main__":
    run_app()
