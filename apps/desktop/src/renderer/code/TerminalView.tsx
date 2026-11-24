import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal, type ITheme } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";
import { OUTPUTS } from "../data/sampleRuns.ts";
import { resolveColor } from "../lib/resolveColor.ts";
import { useAppearance } from "../theme/appearance.ts";

/** The terminal in our colours: canvas, ink, and the theme's red, green, yellow and accent. */
function terminalTheme(): ITheme {
  const ink = resolveColor("--ink");
  const red = resolveColor("--danger-ink");
  const green = resolveColor("--ok-ink");
  const yellow = resolveColor("--caution-ink");
  const blue = resolveColor("--brand");
  const dim = resolveColor("--ink-soft");
  return {
    background: resolveColor("--canvas"),
    foreground: ink,
    cursor: ink,
    selectionBackground: resolveColor("--field-line"),
    black: dim,
    red,
    green,
    yellow,
    blue,
    magenta: blue,
    cyan: blue,
    white: ink,
    brightBlack: dim,
    brightRed: red,
    brightGreen: green,
    brightYellow: yellow,
    brightBlue: blue,
    brightMagenta: blue,
    brightCyan: blue,
    brightWhite: ink,
  };
}

/** Output written a line at a time, as a command prints it. */
const LINE_MS = 45;

/**
 * One terminal screen on xterm.js with its WebGL renderer, the renderer VS Code uses (stack.md §6).
 * The terminal lives in a ref and output goes straight to `write`: no React state in its render
 * loop, as T3 Code keeps theirs. For now it plays the run's output; later the same view reads a
 * real shell on this computer.
 */
export function TerminalView({ outputIds, visible }: { outputIds: string[]; visible: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const terminal = useRef<{ term: Terminal; fit: FitAddon } | null>(null);
  const written = useRef(0);
  const queue = useRef<{ lines: string[]; timer: ReturnType<typeof setTimeout> | undefined }>({ lines: [], timer: undefined });
  const { dark, theme } = useAppearance();

  useEffect(() => {
    const term = new Terminal({
      fontFamily: getComputedStyle(document.documentElement).getPropertyValue("--font-mono"),
      fontSize: 12,
      lineHeight: 1.25,
      cursorBlink: false,
      disableStdin: true,
      scrollback: 5000,
      theme: terminalTheme(),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current!);
    try {
      const webgl = new WebglAddon();
      // A lost GPU context falls back to xterm's DOM renderer.
      webgl.onContextLoss(() => webgl.dispose());
      term.loadAddon(webgl);
    } catch {
      // No WebGL here: the DOM renderer is fine.
    }
    terminal.current = { term, fit };

    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (host.current?.offsetParent) fit.fit();
      });
    });
    observer.observe(host.current!);

    const pending = queue.current;
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      clearTimeout(pending.timer);
      pending.lines = [];
      written.current = 0;
      term.dispose();
      terminal.current = null;
    };
  }, []);

  // New output plays in line by line; anything already shown stays.
  useEffect(() => {
    const pending = queue.current;
    const fresh = outputIds.slice(written.current);
    written.current = outputIds.length;
    for (const id of fresh) pending.lines.push(...(OUTPUTS[id] ?? "").split(/(?<=\n)/));
    const pump = () => {
      const line = pending.lines.shift();
      if (line === undefined) {
        pending.timer = undefined;
        return;
      }
      terminal.current?.term.write(line);
      pending.timer = setTimeout(pump, LINE_MS);
    };
    if (!pending.timer && pending.lines.length) pump();
  }, [outputIds]);

  useEffect(() => {
    if (terminal.current) terminal.current.term.options.theme = terminalTheme();
  }, [dark, theme]);

  // A terminal measured while hidden has no size; fit it when its tab shows.
  useEffect(() => {
    if (visible) requestAnimationFrame(() => terminal.current?.fit.fit());
  }, [visible]);

  return <div ref={host} className="h-full w-full overflow-hidden px-3 py-2" />;
}
