/**
 * Daytona, the mates' desktop provider. The only file that imports the SDK (pinned at 0.231.1;
 * behaviour checked against the Daytona MCP and the SDK's own types, November 2026).
 *
 * Facts this relies on, all checked on a live sandbox:
 * - `computerUse.start()` runs Xvfb at 1024×768, xfce4, x11vnc and noVNC (websockify) on port 6080,
 *   whose page is /vnc.html. 1024×768 is also the size computer-use models are most accurate at.
 * - A stopped sandbox keeps its disk; an archived one is moved to object storage and starts slower.
 * - A private sandbox's preview needs auth; a signed preview URL carries it and can be expired.
 */
import { Daytona, DaytonaError, DaytonaNotFoundError, DaytonaRateLimitError, type Sandbox } from "@daytonaio/sdk";
import { INTERACTIVE_ROLES, type Desktop, type ScreenElement } from "./types.js";

export const NOVNC_PORT = 6080;
/** How long a live-view link works. The app re-fetches it while open; a leaked one dies quickly. */
export const LIVE_URL_SECONDS = 10 * 60;
const START_TIMEOUT_S = 90;
/** An archived desktop comes back from object storage first. */
const ARCHIVED_START_TIMEOUT_S = 300;
const STOP_TIMEOUT_S = 60;
const OUTPUT_CHARS = 4_000;

export const daytonaConfigured = () => !!process.env.DAYTONA_API_KEY && !!process.env.DAYTONA_SNAPSHOT;
const snapshotName = () => process.env.DAYTONA_SNAPSHOT!;

let client: Daytona | undefined;
const daytona = () =>
  (client ??= new Daytona({ apiKey: process.env.DAYTONA_API_KEY, target: process.env.DAYTONA_TARGET || "eu", requestTimeoutMs: 60_000 }));

/** A plain sentence for any provider failure; the SDK's own message can carry ids and URLs. */
export function desktopError(error: unknown): string {
  if (error instanceof DaytonaRateLimitError) return "The computer service is busy right now. Try again in a minute.";
  if (error instanceof DaytonaNotFoundError) return "This computer no longer exists. A new one will be set up next time.";
  if (error instanceof DaytonaError) return "The computer service had a problem. Try again in a minute.";
  return error instanceof Error && error.message.length < 200 ? error.message : "The computer couldn't be reached.";
}

/** One retry with a short pause, for calls that are safe to repeat (create, start, stop, reads). */
async function retryOnce<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof DaytonaNotFoundError) throw error;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    return work();
  }
}

/** A new desktop for one user, from our snapshot (Chrome, LibreOffice, the caption bar…). */
export async function createDesktopSandbox(userId: string): Promise<{ providerId: string; snapshot: string }> {
  const snapshot = snapshotName();
  const sandbox = await retryOnce(() =>
    daytona().create({
      snapshot,
      name: `mates-${userId.replace(/[^a-zA-Z0-9]/g, "").slice(-24)}-${Date.now().toString(36)}`,
      labels: { app: "mates", env: process.env.NODE_ENV === "production" ? "prod" : "dev", user: userId.slice(-32) },
      public: false,
      // Our sweeper stops an idle desktop after 5 minutes; this is only the backstop.
      autoStopInterval: 15,
      autoArchiveInterval: 7 * 24 * 60,
      // Never deleted on a timer: the disk holds the user's logins and files.
      autoDeleteInterval: -1,
    }, { timeout: ARCHIVED_START_TIMEOUT_S }),
  );
  return { providerId: sandbox.id, snapshot };
}

const sandboxOf = (providerId: string) => retryOnce(() => daytona().get(providerId));

/** Starts the sandbox if needed, then the desktop processes. Returns the attached desktop. */
export async function startDesktop(providerId: string): Promise<Desktop> {
  const sandbox = await sandboxOf(providerId);
  if (sandbox.state !== "started") {
    await retryOnce(() => sandbox.start(sandbox.state === "archived" ? ARCHIVED_START_TIMEOUT_S : START_TIMEOUT_S));
  }
  await retryOnce(() => sandbox.computerUse.start());
  return wrap(sandbox);
}

/** Attaches to a running desktop without starting anything. */
export async function attachDesktop(providerId: string): Promise<Desktop> {
  return wrap(await sandboxOf(providerId));
}

export async function stopDesktop(providerId: string) {
  const sandbox = await sandboxOf(providerId);
  if (sandbox.state === "stopped" || sandbox.state === "archived") return;
  await retryOnce(() => sandbox.stop(STOP_TIMEOUT_S));
}

/** The provider's view of the sandbox, for the sweeper and for recovering a lost desktop. */
export async function desktopState(providerId: string): Promise<string | undefined> {
  return (await sandboxOf(providerId)).state;
}

/**
 * A signed noVNC link. `viewOnly` keeps a watcher's taps from moving the mate's mouse; the user's
 * own take-over link drops it. Never log the URL: it is a key to the desktop until it expires.
 */
export async function liveUrl(providerId: string, viewOnly: boolean): Promise<{ url: string; token: string; expiresAt: number }> {
  const sandbox = await sandboxOf(providerId);
  const signed = await sandbox.getSignedPreviewUrl(NOVNC_PORT, LIVE_URL_SECONDS);
  const page = new URL("vnc.html", signed.url.endsWith("/") ? signed.url : `${signed.url}/`);
  page.searchParams.set("autoconnect", "true");
  page.searchParams.set("resize", "scale");
  page.searchParams.set("reconnect", "true");
  page.searchParams.set("show_dot", "true");
  if (viewOnly) page.searchParams.set("view_only", "true");
  return { url: page.toString(), token: signed.token, expiresAt: Date.now() + LIVE_URL_SECONDS * 1000 };
}

export async function expireLiveUrl(providerId: string, token: string) {
  const sandbox = await sandboxOf(providerId);
  await sandbox.expireSignedPreviewUrl(NOVNC_PORT, token);
}

type RawNode = { id?: string; role?: string; name?: string; states?: string[]; bounds?: { x?: number; y?: number; width?: number; height?: number }; children?: RawNode[] };

/** Flattens the accessibility tree to the visible controls a person could act on. */
export function flattenElements(root: RawNode | undefined, limit: number, screen = { width: 1024, height: 768 }): ScreenElement[] {
  const out: ScreenElement[] = [];
  const walk = (node: RawNode) => {
    if (out.length >= limit) return;
    const b = node.bounds;
    const states = node.states ?? [];
    const onScreen = !!b && (b.width ?? 0) > 0 && (b.height ?? 0) > 0 && (b.x ?? -1) >= 0 && (b.y ?? -1) >= 0 && (b.x ?? 0) < screen.width && (b.y ?? 0) < screen.height;
    if (node.id && node.role && INTERACTIVE_ROLES.has(node.role) && onScreen && states.includes("showing")) {
      out.push({ id: node.id, role: node.role, name: (node.name ?? "").slice(0, 80), bounds: { x: b!.x!, y: b!.y!, width: b!.width!, height: b!.height! }, focused: states.includes("focused") });
    }
    for (const child of node.children ?? []) walk(child);
  };
  if (root) walk(root);
  return out;
}

const b64 = (text: string) => Buffer.from(text, "utf8").toString("base64");

function wrap(sandbox: Sandbox): Desktop {
  const cu = sandbox.computerUse;
  return {
    id: sandbox.id,
    async screenshot() {
      const shot = await retryOnce(() => cu.screenshot.takeCompressed({ format: "jpeg", quality: 70, showCursor: true }));
      if (!shot.screenshot) throw new Error("The computer returned an empty screenshot.");
      return { jpegBase64: shot.screenshot, width: 1024, height: 768 };
    },
    async elements(limit = 150) {
      try {
        const tree = await cu.accessibility.getTree({ scope: "all", maxDepth: 30 });
        return flattenElements(tree.root as RawNode | undefined, limit);
      } catch {
        // AT-SPI can be briefly unavailable while an app starts; the screenshot still works.
        return [];
      }
    },
    // Actions are never retried: after a timeout the click or keystroke may already have happened.
    async move(x, y) { await cu.mouse.move(x, y); },
    async click(x, y, options = {}) { await cu.mouse.click(x, y, options.button ?? "left", options.double ?? false); },
    async drag(fromX, fromY, toX, toY) { await cu.mouse.drag(fromX, fromY, toX, toY); },
    async scroll(x, y, direction, amount = 3) { await cu.mouse.scroll(x, y, direction, amount); },
    async type(text, delayMs = 0) { await cu.keyboard.type(text, delayMs || undefined); },
    async press(key, modifiers) { await cu.keyboard.press(key, modifiers); },
    async hotkey(keys) { await cu.keyboard.hotkey(keys); },
    async exec(command, timeoutSeconds = 120) {
      const result = await sandbox.process.executeCommand(command, "/home/daytona", undefined, timeoutSeconds);
      const output = result.result ?? "";
      return { code: result.exitCode, output: output.length > OUTPUT_CHARS ? `…${output.slice(-OUTPUT_CHARS)}` : output };
    },
    async caption(text) {
      // Base64 so nothing in the text can break out of the shell command.
      const command = text === null ? "rm -f /tmp/mates-caption" : `echo ${b64(text.slice(0, 120))} | base64 -d > /tmp/mates-caption`;
      await sandbox.process.executeCommand(command, undefined, undefined, 10).catch(() => undefined);
    },
    async startRecording(label) {
      try { return (await cu.recording.start(label.slice(0, 60))).id; } catch { return null; }
    },
    async stopRecording(id) {
      try { return (await cu.recording.stop(id)).filePath; } catch { return null; }
    },
  };
}
