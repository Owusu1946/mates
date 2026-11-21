#!/usr/bin/env python3
"""Prints the accessibility tree of the app in front, as JSON, for the mate to read its controls.

    mates-a11y [--pid N] [--depth D]

The shape matches Daytona's accessibility.getTree() (role names, state names, screen bounds), so
both providers feed the same flattenElements() in apps/api/src/desktop/elements.ts. With --pid, only
that app; without, every app (shallower). Children per node are capped: a spreadsheet's grid
reports 2^31 cells. Stops after a few seconds whatever it has, rather than stalling the mate.
"""
import argparse
import json
import signal
import sys

import pyatspi

MAX_CHILDREN = 400
MAX_NODES = 4000
SECONDS = 6


class OutOfTime(Exception):
    pass


def on_alarm(_signum, _frame):
    raise OutOfTime()


def node(acc, path, depth, budget):
    if budget[0] <= 0:
        return None
    budget[0] -= 1
    out = {"id": path}
    try:
        out["role"] = acc.getRoleName()
        out["name"] = (acc.name or "")[:200]
        out["states"] = [pyatspi.stateToString(s) for s in acc.getState().getStates()]
    except Exception:
        return out
    try:
        x, y, w, h = acc.queryComponent().getExtents(pyatspi.DESKTOP_COORDS)
        out["bounds"] = {"x": x, "y": y, "width": w, "height": h}
    except Exception:
        pass
    if depth > 0:
        children = []
        try:
            count = min(acc.childCount, MAX_CHILDREN)
        except Exception:
            count = 0
        for i in range(count):
            try:
                child = acc.getChildAtIndex(i)
            except Exception:
                continue
            if child is None:
                continue
            built = node(child, f"{path}.{i}", depth - 1, budget)
            if built is not None:
                children.append(built)
        if children:
            out["children"] = children
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pid", type=int, default=0)
    parser.add_argument("--depth", type=int, default=8)
    args = parser.parse_args()
    signal.signal(signal.SIGALRM, on_alarm)
    signal.alarm(SECONDS)
    budget = [MAX_NODES]
    root = {"id": "0", "role": "desktop frame", "name": "", "states": [], "children": []}
    try:
        desktop = pyatspi.Registry.getDesktop(0)
        for i in range(desktop.childCount):
            app = desktop.getChildAtIndex(i)
            if app is None:
                continue
            if args.pid:
                try:
                    if app.get_process_id() != args.pid:
                        continue
                except Exception:
                    continue
            built = node(app, f"0.{i}", args.depth, budget)
            if built is not None:
                root["children"].append(built)
    except OutOfTime:
        pass
    signal.alarm(0)
    json.dump(root, sys.stdout, separators=(",", ":"))


if __name__ == "__main__":
    main()
