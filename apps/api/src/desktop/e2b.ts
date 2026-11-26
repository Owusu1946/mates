/**
 * E2B, the mates' desktop provider. The only file that imports the SDK (`e2b`, pinned at 2.64.0;
 * behaviour checked against the SDK's own types and source, docs.e2b.dev, and a live sandbox,
 * November 2026).
 *
 * Facts this relies on:
 * - Our template (scripts/computer-template.ts) snapshots the desktop already running: a new
 *   sandbox has the screen, xfce, x11vnc and noVNC (port 6080) on, as user `user` in /home/user.
 * - `pause()` keeps memory and disk (about 2s); `Sandbox.connect()` resumes a paused sandbox (about
 *   1s) with every window as it was. A paused sandbox is kept until killed.
 * - A sandbox paused while its guest agent didn't answer can only come back cold:
 *   `GuestUnresponsiveError`, then connect again with `onResume: 'reboot'` and restart the desktop.
 * - `commands.run` throws `CommandExitError` on a non-zero exit, carrying the code and output.
 * - `xdotool getactivewindow` fails until xfwm4 has set _NET_ACTIVE_WINDOW (just after boot);
 *   `getwindowfocus` is the fallback, as in E2B's desktop-js.
 * - Public traffic is on so the phone's noVNC page can reach port 6080 (its websocket can't send the
 *   traffic-token header). The live view is guarded by x11vnc's own passwords instead: a control
 *   one and a watch-only one, rotated per link (see scripts/computer/mates-desktop).
 */
import { randomInt } from "node:crypto";
import {
  CommandExitError,
  GuestUnresponsiveError,
  NotFoundError,
  RateLimitError,
  Sandbox,
  SandboxError,
  ServiceBusyError,
  TimeoutError,
} from "e2b";
import { flattenElements, type RawNode } from "./elements.js";
import type { Desktop, MouseButton, ScreenElement } from "./types.js";

export const NOVNC_PORT = 6080;
/** How long a live-view link is handed out for; the app re-fetches it while open. */
export const LIVE_URL_SECONDS = 10 * 60;
const USER = "user";
const HOME = "/home/user";
const OUTPUT_CHARS = 4_000;
const REQUEST_TIMEOUT_MS = 60_000;
/** Pausing 8 GB of memory takes a few seconds, more on a busy node. */
const PAUSE_REQUEST_TIMEOUT_MS = 180_000;
const PAUSE_ATTEMPTS = 3;

export const e2bConfigured = () => !!process.env.E2B_API_KEY && !!process.env.E2B_TEMPLATE;
const templateName = () => process.env.E2B_TEMPLATE!;
/**
 * How long a desktop runs with nothing resetting it before E2B pauses it: the backstop behind our
 * own sweeper (5 idle minutes). E2B caps it at 1 hour on Hobby, 24 on Pro.
 */
export const sandboxTimeoutMs = () => Math.min(Math.max(Number(process.env.E2B_TIMEOUT_MS) || 15 * 60_000, 60_000), 24 * 60 * 60_000);
const api = (requestTimeoutMs = REQUEST_TIMEOUT_MS) => ({ apiKey: process.env.E2B_API_KEY, requestTimeoutMs });

/** A plain sentence for any provider failure; the SDK's own message can carry ids and URLs. */
export function desktopError(error: unknown): string {
  if (error instanceof RateLimitError || error instanceof ServiceBusyError) return "The computer service is busy right now. Try again in a minute.";
  if (error instanceof NotFoundError) return "This computer no longer exists. A new one will be set up next time.";
  if (error instanceof TimeoutError) return "The computer took too long to answer. Try again in a minute.";
  if (error instanceof SandboxError) return "The computer service had a problem. Try again in a minute.";
  return error instanceof Error && error.message.length < 200 ? error.message : "The computer couldn't be reached.";
}

/** The desktop is gone for good (killed, or never existed): a new one has to be made. */
export const desktopGone = (error: unknown) => error instanceof NotFoundError;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** One retry with a short pause, for calls that are safe to repeat (connect, reads). */
async function retryOnce<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof GuestUnresponsiveError) throw error;
    await sleep(2_000);
    return work();
  }
}

/**
 * Connected sandboxes, reused for a few minutes so a burst of calls (a mate's steps, the live view
 * being refreshed) doesn't reconnect each time. A start always connects afresh; a stop or delete
 * forgets it.
 */
const connections = new Map<string, { sandbox: Sandbox; at: number }>();
const CONNECTION_MS = 5 * 60_000;
async function connected(providerId: string): Promise<Sandbox> {
  const cached = connections.get(providerId);
  if (cached && Date.now() - cached.at < CONNECTION_MS) return cached.sandbox;
  const sandbox = await retryOnce(() => Sandbox.connect(providerId, api()));
  connections.set(providerId, { sandbox, at: Date.now() });
  return sandbox;
}

export type CommandOutput = { code: number; stdout: string; stderr: string };

/** Runs a shell command on the desktop as its user, with its screen; a non-zero exit is returned, not thrown. */
export async function run(sandbox: Pick<Sandbox, "commands">, command: string, timeoutSeconds = 30): Promise<CommandOutput> {
  try {
    const result = await sandbox.commands.run(command, { user: USER, cwd: HOME, envs: { DISPLAY: ":0" }, timeoutMs: timeoutSeconds * 1000 });
    return { code: result.exitCode, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    if (error instanceof CommandExitError) return { code: error.exitCode, stdout: error.stdout, stderr: error.stderr };
    throw error;
  }
}

/**
 * The key that makes creating a desktop safe to retry. E2B takes only lowercase letters, digits and
 * hyphens, and Clerk ids have capitals ("user_3MMWYVm…"), so the id is lowercased as well as
 * stripped. The time keeps a desktop made after the last one was deleted from reusing its key.
 */
export function sandboxIdempotencyKey(userId: string, now = Date.now()): string {
  return `mates-${userId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(-24)}-${now.toString(36)}`;
}

/** A new desktop for one user, from our template: already on when this returns. */
export async function createDesktopSandbox(userId: string): Promise<{ providerId: string; snapshot: string }> {
  const template = templateName();
  // One key for both tries, so a retry after a lost response can't make a second desktop.
  const idempotencyKey = sandboxIdempotencyKey(userId);
  const sandbox = await retryOnce(() =>
    Sandbox.create(template, {
      ...api(),
      idempotencyKey,
      timeoutMs: sandboxTimeoutMs(),
      // Never killed on a timer: the disk and memory hold the user's logins and open windows.
      lifecycle: { onTimeout: "pause", autoResume: false },
      metadata: { app: "mates", env: process.env.NODE_ENV === "production" ? "prod" : "dev", user: userId.slice(-32) },
      allowInternetAccess: true,
      network: { allowPublicTraffic: true },
    }),
  );
  return { providerId: sandbox.sandboxId, snapshot: template };
}

/**
 * Resumes the desktop if it's paused and makes sure the screen and live view are up. Safe to call
 * on one that is already on: a running desktop is left as it is, so open windows survive.
 */
export async function startDesktop(providerId: string): Promise<Desktop> {
  let sandbox: Sandbox;
  try {
    sandbox = await retryOnce(() => Sandbox.connect(providerId, { ...api(), timeoutMs: sandboxTimeoutMs() }));
  } catch (error) {
    if (!(error instanceof GuestUnresponsiveError)) throw error;
    // Its memory can't come back; boot it from its disk (files and logins are there).
    sandbox = await Sandbox.connect(providerId, { ...api(), timeoutMs: sandboxTimeoutMs(), onResume: "reboot" });
  }
  connections.set(providerId, { sandbox, at: Date.now() });
  if ((await run(sandbox, "mates-desktop status", 15)).code !== 0) {
    const started = await run(sandbox, "mates-desktop start", 120);
    if (started.code !== 0) throw new Error("The computer's screen didn't start. Try again in a minute.");
  }
  return wrap(sandbox);
}

/** Pushes back E2B's own pause, so a desktop the user is working on by hand stays on. */
export async function keepDesktopAlive(providerId: string) {
  await Sandbox.setTimeout(providerId, sandboxTimeoutMs(), api());
}

/** Attaches to a running desktop. */
export async function attachDesktop(providerId: string): Promise<Desktop> {
  return wrap(await connected(providerId));
}

/** Pauses the desktop, keeping its memory: the next start picks up exactly where it was. */
export async function stopDesktop(providerId: string) {
  connections.delete(providerId);
  for (let attempt = 1; ; attempt++) {
    try {
      await Sandbox.pause(providerId, api(PAUSE_REQUEST_TIMEOUT_MS));
      return;
    } catch (error) {
      // Already gone: nothing is running, which is what stopping wanted.
      if (error instanceof NotFoundError) return;
      // The node is still saving the last pause; the desktop keeps running meanwhile.
      if (error instanceof ServiceBusyError && attempt < PAUSE_ATTEMPTS) {
        await sleep(5_000);
        continue;
      }
      throw error;
    }
  }
}

/** Deletes the desktop and everything on it for good (account deletion). Already gone counts as done. */
export async function deleteDesktop(providerId: string) {
  connections.delete(providerId);
  await Sandbox.kill(providerId, api());
}

/** The provider's view of the desktop, in the lifecycle's words: "started", "stopped", or "gone". */
export async function desktopState(providerId: string): Promise<string | undefined> {
  try {
    const info = await retryOnce(() => Sandbox.getInfo(providerId, api()));
    return info.state === "running" ? "started" : info.state === "paused" ? "stopped" : info.state;
  } catch (error) {
    if (desktopGone(error)) return "gone";
    throw error;
  }
}

const PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
/** VNC passwords are 8 characters; random per link. */
export function livePassword() {
  return Array.from({ length: 8 }, () => PASSWORD_CHARS[randomInt(PASSWORD_CHARS.length)]).join("");
}

/** The noVNC page for a running desktop, signed in with `password`. */
export function liveViewUrl(host: string, password: string, viewOnly: boolean) {
  const page = new URL(`https://${host}/vnc.html`);
  page.searchParams.set("autoconnect", "true");
  page.searchParams.set("resize", "scale");
  page.searchParams.set("reconnect", "true");
  page.searchParams.set("show_dot", "true");
  if (viewOnly) page.searchParams.set("view_only", "true");
  page.searchParams.set("password", password);
  return page.toString();
}

/**
 * A live-view link. Each one sets a fresh password for its role: a watch-only link's password can
 * only watch (x11vnc enforces it, not the page), and a new link turns the last one of the same role
 * off for new connections. Never log the URL: it is a key to the desktop.
 */
export async function liveUrl(providerId: string, viewOnly: boolean): Promise<{ url: string; token: string; expiresAt: number }> {
  const sandbox = await connected(providerId);
  const password = livePassword();
  const set = await run(sandbox, `mates-desktop password ${viewOnly ? "view" : "control"} ${password}`, 15);
  if (set.code !== 0) throw new Error("The live view couldn't be set up.");
  return { url: liveViewUrl(sandbox.getHost(NOVNC_PORT), password, viewOnly), token: `${viewOnly ? "view" : "control"}:${password}`, expiresAt: Date.now() + LIVE_URL_SECONDS * 1000 };
}

/**
 * Turns a link off. A control link also drops every connection, so whoever had the mouse loses it
 * at once; a watcher's page reconnects by itself with its own password, which still works.
 */
export async function expireLiveUrl(providerId: string, token: string) {
  const [role] = token.split(":");
  if (role !== "view" && role !== "control") return;
  const sandbox = await connected(providerId);
  await run(sandbox, `mates-desktop password ${role} ${livePassword()}`, 15);
  if (role === "control") await run(sandbox, "mates-desktop disconnect", 15);
}

/** Single-quotes text for the shell, as E2B's desktop-js does. */
export function shellQuote(text: string) {
  if (!text) return "''";
  if (!/[^\w@%+=:,./-]/.test(text)) return text;
  return `'${text.replace(/'/g, `'"'"'`)}'`;
}

/** Key names the agent uses, as xdotool keysyms (after E2B's desktop-js). */
const KEYS: Record<string, string> = {
  alt: "alt", backspace: "BackSpace", capslock: "Caps_Lock", caps_lock: "Caps_Lock", cmd: "super", command: "super", control: "ctrl", ctrl: "ctrl",
  del: "Delete", delete: "Delete", down: "Down", end: "End", enter: "Return", esc: "Escape", escape: "Escape", home: "Home", insert: "Insert",
  left: "Left", menu: "Menu", meta: "super", option: "alt", pagedown: "Next", page_down: "Next", pageup: "Prior", page_up: "Prior",
  return: "Return", right: "Right", shift: "shift", space: "space", super: "super", tab: "Tab", up: "Up", win: "super", windows: "super",
  plus: "plus", minus: "minus",
};

/** A key as xdotool knows it, or null if it isn't a plain key name (nothing else reaches the shell). */
export function xdotoolKey(key: string): string | null {
  const trimmed = key.trim();
  if (trimmed === "+") return "plus";
  if (trimmed === "-") return "minus";
  const mapped = KEYS[trimmed.toLowerCase()] ?? (/^f([1-9]|1[0-2])$/i.test(trimmed) ? trimmed.toUpperCase() : trimmed);
  // Keysym names (Return, a, F5) or one printable character; nothing else reaches the shell.
  return /^[A-Za-z0-9_]+$/.test(mapped) || /^[!-~]$/.test(mapped) ? mapped : null;
}

/** A combination like ["ctrl", "shift", "t"] as one xdotool argument, safely quoted. */
export function keyCombo(keys: string[]): string {
  const mapped = keys.map(xdotoolKey);
  if (!mapped.length || mapped.some((key) => key === null)) throw new Error(`That key isn't one the computer knows: ${keys.join("+")}`);
  return shellQuote(mapped.join("+"));
}

const BUTTON: Record<MouseButton, number> = { left: 1, middle: 2, right: 3 };
const SCROLL: Record<"up" | "down" | "left" | "right", number> = { up: 4, down: 5, left: 6, right: 7 };
const int = (value: number) => Math.max(0, Math.round(value));

/**
 * The desktop session's own dbus, so apps a command opens show on screen and expose their
 * controls to the accessibility tree (envd runs commands outside the session).
 */
export const SESSION = String.raw`export DBUS_SESSION_BUS_ADDRESS="$(tr '\0' '\n' < /proc/$(pgrep -f xfce4-session | head -1)/environ 2>/dev/null | sed -n 's/^DBUS_SESSION_BUS_ADDRESS=//p')";`;

/** A safe file name from a recording's label. */
const recordingName = (label: string) => `${label.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "recording"}-${Date.now().toString(36)}`;

export function wrap(sandbox: Pick<Sandbox, "sandboxId" | "commands">): Desktop {
  const sh = (command: string, timeoutSeconds?: number) => run(sandbox, command, timeoutSeconds);
  /** An action that must have happened: a failure is an error, never quietly ignored. Never retried. */
  const act = async (command: string) => {
    const result = await sh(command, 30);
    if (result.code !== 0) throw new Error(`The computer didn't do that: ${(result.stderr || result.stdout).trim().slice(0, 160)}`);
  };
  return {
    id: sandbox.sandboxId,
    async screenshot() {
      // One round trip: capture (with the pointer), print as base64, clean up.
      const file = `/tmp/mates-shot-${Date.now().toString(36)}${randomInt(1e6)}.jpg`;
      const shot = await retryOnce(() => sh(`scrot -p -q 70 ${file} && base64 -w0 ${file}; rm -f ${file}`, 30));
      const jpegBase64 = shot.stdout.trim();
      if (shot.code !== 0 || !jpegBase64) throw new Error("The computer returned an empty screenshot.");
      return { jpegBase64, width: 1024, height: 768 };
    },
    async elements(limit = 150) {
      // Only the app in front: the whole desktop's tree breaks on a spreadsheet, whose grid reports
      // 2^31 children. Deep first, then shallower if a huge control still trips it; never a stall.
      const work = async () => {
        // The active window once the window manager has set it; the focused one while it starts.
        const front = await sh("xdotool getactivewindow getwindowpid 2>/dev/null || xdotool getwindowfocus getwindowpid 2>/dev/null", 5);
        const pid = Number(front.stdout.trim());
        for (const depth of [14, 8]) {
          const tree = await sh(`${SESSION} mates-a11y ${pid > 0 ? `--pid ${pid} --depth ${depth}` : "--depth 6"}`, 10).catch(() => null);
          if (!tree || tree.code !== 0) continue;
          try {
            return flattenElements(JSON.parse(tree.stdout) as RawNode, limit);
          } catch {
            // Cut off mid-way; try shallower.
          }
        }
        return [];
      };
      return Promise.race([work().catch(() => [] as ScreenElement[]), new Promise<ScreenElement[]>((resolve) => setTimeout(() => resolve([]), 8_000))]);
    },
    async move(x, y) { await act(`xdotool mousemove ${int(x)} ${int(y)}`); },
    async click(x, y, options = {}) {
      await act(`xdotool mousemove ${int(x)} ${int(y)} click ${options.double ? "--repeat 2 " : ""}${BUTTON[options.button ?? "left"]}`);
    },
    async drag(fromX, fromY, toX, toY) {
      await act(`xdotool mousemove ${int(fromX)} ${int(fromY)} mousedown 1 mousemove ${int(toX)} ${int(toY)} mouseup 1`);
    },
    async scroll(x, y, direction, amount = 3) {
      await act(`xdotool mousemove ${int(x)} ${int(y)} click --repeat ${Math.min(Math.max(int(amount), 1), 50)} ${SCROLL[direction]}`);
    },
    async type(text, delayMs = 0) {
      // In pieces, so a long text never makes one huge command line.
      for (let i = 0; i < text.length; i += 200) {
        await act(`xdotool type --delay ${Math.min(Math.max(int(delayMs), 0), 500) || 8} -- ${shellQuote(text.slice(i, i + 200))}`);
      }
    },
    async press(key, modifiers) { await act(`xdotool key ${keyCombo([...(modifiers ?? []), key])}`); },
    async hotkey(keys) { await act(`xdotool key ${keyCombo(keys.split("+"))}`); },
    async exec(command, timeoutSeconds = 120) {
      const result = await sh(`${SESSION} ${command}`, timeoutSeconds);
      const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
      return { code: result.code, output: output.length > OUTPUT_CHARS ? `…${output.slice(-OUTPUT_CHARS)}` : output };
    },
    async caption(text) {
      // Base64 so nothing in the text can break out of the shell command.
      const command = text === null ? "rm -f /tmp/mates-caption" : `echo ${Buffer.from(text.slice(0, 120), "utf8").toString("base64")} | base64 -d > /tmp/mates-caption`;
      await sh(command, 10).catch(() => undefined);
    },
    async startRecording(label) {
      const name = recordingName(label);
      const file = `${HOME}/Mates/recordings/${name}.mp4`;
      const started = await sh(
        `mkdir -p ${HOME}/Mates/recordings && (setsid ffmpeg -nostdin -loglevel error -f x11grab -framerate 5 -video_size 1024x768 -i :0 -c:v libx264 -preset ultrafast -pix_fmt yuv420p ${file} >/tmp/${name}.log 2>&1 < /dev/null & echo $! > /tmp/${name}.pid)`,
        15,
      ).catch(() => null);
      return started?.code === 0 ? name : null;
    },
    async stopRecording(id) {
      if (!/^[a-z0-9-]+$/.test(id)) return null;
      // ffmpeg finishes the file on SIGINT; give it a moment to write the end.
      const stopped = await sh(
        `pid=$(cat /tmp/${id}.pid 2>/dev/null) && kill -INT "$pid" 2>/dev/null; for i in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || break; sleep 0.25; done; test -s ${HOME}/Mates/recordings/${id}.mp4 && echo ${HOME}/Mates/recordings/${id}.mp4`,
        15,
      ).catch(() => null);
      return stopped?.stdout.trim() || null;
    },
  };
}
