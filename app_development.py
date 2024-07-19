import tkinter as tk
from tkinter import ttk

class MidiSplitApp(tk.Tk):
    def __init__(self):
        super().__init__()

        self.title("MIDI Split Point Selector")
        self.geometry("300x150")

        self.split_point = tk.IntVar(value=0)

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

    def update_split_point(self, *args):
        split_value = self.split_point.get()
        self.value_display.config(text=f"Selected Split Point: {split_value}")
        print(f"Split Point: {split_value}")
        # Here you can add your code to trigger sounds or any other functionality

if __name__ == "__main__":
    app = MidiSplitApp()
    app.mainloop()

