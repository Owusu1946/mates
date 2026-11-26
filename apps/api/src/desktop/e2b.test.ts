import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandExitError, GuestUnresponsiveError, NotFoundError, RateLimitError, ServiceBusyError } from "e2b";

/** A fake E2B: records commands, answers them from `replies`, and lets each test script the API. */
const fake = vi.hoisted(() => ({
  commands: [] as string[],
  replies: [] as [RegExp, { exitCode: number; stdout: string; stderr: string }][],
  connect: vi.fn(),
  pause: vi.fn(),
  kill: vi.fn(),
  getInfo: vi.fn(),
  setTimeout: vi.fn(),
  create: vi.fn(),
}));

vi.mock("e2b", async (importOriginal) => {
  const actual = await importOriginal<typeof import("e2b")>();
  return {
    ...actual,
    Sandbox: { connect: fake.connect, pause: fake.pause, kill: fake.kill, getInfo: fake.getInfo, setTimeout: fake.setTimeout, create: fake.create },
  };
});

const { createDesktopSandbox, desktopError, desktopState, expireLiveUrl, keyCombo, liveUrl, liveViewUrl, livePassword, run, sandboxIdempotencyKey, shellQuote, startDesktop, stopDesktop, wrap, xdotoolKey } = await import("./e2b.js");

/** A connected sandbox whose commands answer from fake.replies (exit 0 and no output otherwise). */
function sandbox() {
  return {
    sandboxId: "sbx1",
    getHost: (port: number) => `${port}-sbx1.e2b.app`,
    commands: {
      run: async (command: string) => {
        fake.commands.push(command);
        const reply = fake.replies.find(([pattern]) => pattern.test(command))?.[1] ?? { exitCode: 0, stdout: "", stderr: "" };
        if (reply.exitCode !== 0) throw new CommandExitError(reply);
        return reply;
      },
    },
  };
}

beforeEach(() => {
  fake.commands = [];
  fake.replies = [];
  for (const fn of [fake.connect, fake.pause, fake.kill, fake.getInfo, fake.setTimeout, fake.create]) fn.mockReset();
  fake.connect.mockImplementation(async () => sandbox());
  process.env.E2B_API_KEY = "test";
  process.env.E2B_TEMPLATE = "mates-desktop-v1";
});
afterEach(() => vi.useRealTimers());

describe("commands", () => {
  it("returns a failing command's exit code and output instead of throwing", async () => {
    fake.replies.push([/boom/, { exitCode: 3, stdout: "out", stderr: "err" }]);
    expect(await run(sandbox() as never, "boom")).toEqual({ code: 3, stdout: "out", stderr: "err" });
  });

  it("quotes text for the shell so nothing can break out", () => {
    expect(shellQuote("hello")).toBe("hello");
    expect(shellQuote("")).toBe("''");
    expect(shellQuote("it's $(rm -rf ~)")).toBe(`'it'"'"'s $(rm -rf ~)'`);
  });
});

describe("keys", () => {
  it("maps the agent's key names to xdotool's", () => {
    expect(xdotoolKey("enter")).toBe("Return");
    expect(xdotoolKey("pagedown")).toBe("Next");
    expect(xdotoolKey("f5")).toBe("F5");
    expect(xdotoolKey("a")).toBe("a");
    expect(xdotoolKey("+")).toBe("plus");
    expect(keyCombo(["ctrl", "shift", "t"])).toBe("ctrl+shift+t");
  });

  it("refuses anything that isn't a key name", () => {
    expect(xdotoolKey("Return; rm -rf ~")).toBeNull();
    expect(() => keyCombo(["ctrl", "$(reboot)"])).toThrow(/isn't one the computer knows/);
  });
});

describe("the desktop", () => {
  it("clicks, double-clicks, drags and scrolls through xdotool, at whole pixels", async () => {
    const desktop = wrap(sandbox() as never);
    await desktop.click(10.4, 20.6);
    await desktop.click(5, 5, { button: "right", double: true });
    await desktop.drag(1, 2, 3, 4);
    await desktop.scroll(100, 200, "down", 2);
    expect(fake.commands).toEqual([
      "xdotool mousemove 10 21 click 1",
      "xdotool mousemove 5 5 click --repeat 2 3",
      "xdotool mousemove 1 2 mousedown 1 mousemove 3 4 mouseup 1",
      "xdotool mousemove 100 200 click --repeat 2 5",
    ]);
  });

  it("types long text in pieces, quoted, at the given pace", async () => {
    const desktop = wrap(sandbox() as never);
    await desktop.type(`${"a".repeat(250)} it's`, 40);
    expect(fake.commands).toHaveLength(2);
    expect(fake.commands[0]).toBe(`xdotool type --delay 40 -- ${"a".repeat(200)}`);
    expect(fake.commands[1]).toBe(`xdotool type --delay 40 -- '${"a".repeat(50)} it'"'"'s'`);
  });

  it("presses keys with modifiers, and says so when an action fails", async () => {
    const desktop = wrap(sandbox() as never);
    await desktop.press("t", ["ctrl"]);
    await desktop.hotkey("ctrl+c");
    expect(fake.commands).toEqual(["xdotool key ctrl+t", "xdotool key ctrl+c"]);
    fake.replies.push([/xdotool key/, { exitCode: 1, stdout: "", stderr: "Can't open display" }]);
    await expect(desktop.press("enter")).rejects.toThrow(/didn't do that: Can't open display/);
  });

  it("runs commands in the desktop session and trims long output", async () => {
    fake.replies.push([/long-output/, { exitCode: 0, stdout: "x".repeat(5_000), stderr: "" }]);
    const desktop = wrap(sandbox() as never);
    const result = await desktop.exec("long-output");
    expect(fake.commands[0]).toMatch(/^export DBUS_SESSION_BUS_ADDRESS=.*xfce4-session.* long-output$/);
    expect(result.code).toBe(0);
    expect(result.output.startsWith("…")).toBe(true);
    expect(result.output.length).toBe(4_001);
  });

  it("returns a screenshot as base64, and fails clearly on an empty one", async () => {
    fake.replies.push([/scrot/, { exitCode: 0, stdout: "/9j/abc=\n", stderr: "" }]);
    const desktop = wrap(sandbox() as never);
    expect(await desktop.screenshot()).toEqual({ jpegBase64: "/9j/abc=", width: 1024, height: 768 });
    fake.replies[0] = [/scrot/, { exitCode: 0, stdout: "", stderr: "" }];
    await expect(desktop.screenshot()).rejects.toThrow(/empty screenshot/);
  });

  it("reads the front app's controls from the accessibility script", async () => {
    fake.replies.push([/getactivewindow/, { exitCode: 0, stdout: "4242\n", stderr: "" }]);
    const tree = { id: "0", role: "desktop frame", children: [{ id: "0.1", role: "push button", name: "Search", states: ["showing", "focused"], bounds: { x: 10, y: 20, width: 80, height: 30 } }] };
    fake.replies.push([/mates-a11y --pid 4242 --depth 14/, { exitCode: 0, stdout: JSON.stringify(tree), stderr: "" }]);
    const elements = await wrap(sandbox() as never).elements();
    expect(elements).toEqual([{ id: "0.1", role: "push button", name: "Search", bounds: { x: 10, y: 20, width: 80, height: 30 }, focused: true }]);
  });

  it("writes the caption as base64 so it can't break the command", async () => {
    await wrap(sandbox() as never).caption("Kofi · it's $(done)");
    expect(fake.commands[0]).toMatch(/^echo [A-Za-z0-9+/=]+ \| base64 -d > \/tmp\/mates-caption$/);
  });
});

describe("the live view", () => {
  it("makes 8-character passwords without look-alike characters", () => {
    for (let i = 0; i < 50; i++) expect(livePassword()).toMatch(/^[A-HJ-NP-Za-km-z2-9]{8}$/);
  });

  it("links to noVNC on the desktop's host, watch-only when asked", () => {
    const url = new URL(liveViewUrl("6080-sbx1.e2b.app", "Abcd2345", true));
    expect(url.origin + url.pathname).toBe("https://6080-sbx1.e2b.app/vnc.html");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ autoconnect: "true", resize: "scale", reconnect: "true", view_only: "true", password: "Abcd2345" });
    expect(new URL(liveViewUrl("h", "Abcd2345", false)).searchParams.has("view_only")).toBe(false);
  });

  it("sets a fresh password for the link's role", async () => {
    const view = await liveUrl("sbx1", true);
    const password = new URL(view.url).searchParams.get("password")!;
    expect(fake.commands).toEqual([`mates-desktop password view ${password}`]);
    expect(view.token).toBe(`view:${password}`);
    const control = await liveUrl("sbx1", false);
    expect(fake.commands[1]).toMatch(/^mates-desktop password control [A-Za-z0-9]{8}$/);
    expect(new URL(control.url).searchParams.has("view_only")).toBe(false);
  });

  it("turns a control link off at once, and a watch link for new connections", async () => {
    await expireLiveUrl("sbx1", "control:Abcd2345");
    expect(fake.commands[0]).toMatch(/^mates-desktop password control [A-Za-z0-9]{8}$/);
    expect(fake.commands[0]).not.toContain("Abcd2345");
    expect(fake.commands[1]).toBe("mates-desktop disconnect");
    fake.commands = [];
    await expireLiveUrl("sbx1", "view:Abcd2345");
    expect(fake.commands).toHaveLength(1);
    expect(fake.commands[0]).toMatch(/^mates-desktop password view /);
  });
});

describe("lifecycle", () => {
  it("resumes a paused desktop and leaves a running one as it is", async () => {
    await startDesktop("sbx1");
    expect(fake.connect).toHaveBeenCalledWith("sbx1", expect.objectContaining({ timeoutMs: expect.any(Number) }));
    expect(fake.commands).toEqual(["mates-desktop status"]);
  });

  it("starts the screen if it isn't up (a desktop that booted cold)", async () => {
    fake.replies.push([/mates-desktop status/, { exitCode: 1, stdout: "", stderr: "" }]);
    await startDesktop("sbx1");
    expect(fake.commands).toEqual(["mates-desktop status", "mates-desktop start"]);
  });

  it("boots a desktop from its disk when its memory can't come back", async () => {
    fake.connect.mockImplementationOnce(async () => { throw new GuestUnresponsiveError("resume refused"); });
    await startDesktop("sbx1");
    expect(fake.connect).toHaveBeenLastCalledWith("sbx1", expect.objectContaining({ onResume: "reboot" }));
  });

  it("retries a pause while the node is busy, and treats a gone desktop as stopped", async () => {
    vi.useFakeTimers();
    fake.pause.mockRejectedValueOnce(new ServiceBusyError("busy")).mockResolvedValueOnce(true);
    const stopping = stopDesktop("sbx1");
    await vi.advanceTimersByTimeAsync(5_000);
    await stopping;
    expect(fake.pause).toHaveBeenCalledTimes(2);
    fake.pause.mockRejectedValueOnce(new NotFoundError("gone"));
    await expect(stopDesktop("sbx1")).resolves.toBeUndefined();
  });

  it("reports state in the lifecycle's words", async () => {
    fake.getInfo.mockResolvedValueOnce({ state: "running" }).mockResolvedValueOnce({ state: "paused" }).mockRejectedValueOnce(new NotFoundError("gone"));
    expect(await desktopState("sbx1")).toBe("started");
    expect(await desktopState("sbx1")).toBe("stopped");
    expect(await desktopState("sbx1")).toBe("gone");
  });

  it("explains failures in plain sentences", () => {
    expect(desktopError(new RateLimitError("429 team abc"))).toMatch(/busy right now/);
    expect(desktopError(new ServiceBusyError("503"))).toMatch(/busy right now/);
    expect(desktopError(new NotFoundError("sandbox sbx1 not found"))).toMatch(/no longer exists/);
  });
});

describe("creating a desktop", () => {
  // E2B rejects anything else: "Invalid idempotencyKey: only lowercase letters, digits and hyphens are allowed."
  const VALID = /^[a-z0-9-]+$/;

  it("builds a key E2B accepts from a Clerk id with capitals", () => {
    const key = sandboxIdempotencyKey("user_3MMWYVm8nGUI2El8FlgNlCMvRxE", 1_764_000_000_000);
    expect(key).toMatch(VALID);
    // The last 24 characters of the id, as before, now lowercased.
    expect(key).toBe(`mates-wyvm8ngui2el8flgnlcmvrxe-${(1_764_000_000_000).toString(36)}`);
  });

  it("sends that key to E2B, the same one on a retry", async () => {
    vi.stubEnv("E2B_API_KEY", "key");
    vi.stubEnv("E2B_TEMPLATE", "mates-desktop");
    fake.create.mockReset();
    fake.create.mockRejectedValueOnce(new ServiceBusyError("busy")).mockResolvedValueOnce({ sandboxId: "sbx_1" });
    await expect(createDesktopSandbox("user_3MMWYVm8nGUI2El8FlgNlCMvRxE")).resolves.toEqual({ providerId: "sbx_1", snapshot: "mates-desktop" });
    const keys = fake.create.mock.calls.map((call) => call[1].idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(VALID);
    expect(keys[1]).toBe(keys[0]);
    vi.unstubAllEnvs();
  });
});
