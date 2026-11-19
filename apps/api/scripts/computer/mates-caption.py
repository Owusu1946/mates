#!/usr/bin/env python3
"""The strip across the top of the mates' desktop that says what the mate is doing.

The API writes one line to /tmp/mates-caption ("Kofi · Filling the Acme form"); this shows it in a
small always-on-top bar under the panel, and hides the bar when the file is gone. Started by xfce
autostart, so it comes up with the desktop.
"""
import os
import tkinter as tk

PATH = "/tmp/mates-caption"

root = tk.Tk()
root.overrideredirect(True)
root.attributes("-topmost", True)
root.configure(bg="#18181b")
label = tk.Label(root, text="", fg="#fafafa", bg="#18181b", font=("Noto Sans", 11, "bold"), padx=14, pady=5)
label.pack()
root.withdraw()
shown = False
last = None


def tick():
    global shown, last
    try:
        with open(PATH, encoding="utf-8") as f:
            text = f.read().strip()[:120]
    except OSError:
        text = ""
    if text != last:
        last = text
        if text:
            label.configure(text=text)
            root.update_idletasks()
            width = label.winfo_reqwidth()
            screen = root.winfo_screenwidth()
            root.geometry(f"+{max(0, (screen - width) // 2)}+32")
            if not shown:
                root.deiconify()
                shown = True
        elif shown:
            root.withdraw()
            shown = False
    if shown:
        root.lift()
    root.after(400, tick)


tick()
root.mainloop()
