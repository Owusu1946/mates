/**
 * End-to-end check of the E2B desktop through our own adapter (src/desktop/e2b.ts), on a fresh
 * desktop that is deleted at the end. Uses E2B_API_KEY and E2B_TEMPLATE from apps/api/.env.
 *   pnpm exec tsx scripts/computer-smoke.ts
 * Prints each step with its time; exits non-zero if any step fails.
 */
import "../src/load-env.js";
import * as e2b from "../src/desktop/e2b.js";

if (!e2b.e2bConfigured()) {
  console.error("Set E2B_API_KEY and E2B_TEMPLATE in apps/api/.env first.");
  process.exit(1);
}

let failed = false;
async function step<T>(name: string, work: () => Promise<T>, check?: (value: T) => string | true): Promise<T | undefined> {
  const started = Date.now();
  try {
    const value = await work();
    const verdict = check ? check(value) : true;
    const ms = Date.now() - started;
    if (verdict === true) console.log(`ok   ${name} (${ms} ms)`);
    else {
      failed = true;
      console.log(`FAIL ${name} (${ms} ms): ${verdict}`);
    }
    return value;
  } catch (error) {
    failed = true;
    console.log(`FAIL ${name} (${Date.now() - started} ms): ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

const created = await step("create a desktop from the template", () => e2b.createDesktopSandbox("smoke_test_user"));
if (!created) process.exit(1);
const id = created.providerId;
try {
  const desktop = await step("start it (already on)", () => e2b.startDesktop(id));
  if (!desktop) throw new Error("no desktop");
  await step("screenshot", () => desktop.screenshot(), (shot) => (shot.jpegBase64.startsWith("/9j/") && shot.jpegBase64.length > 5_000 ? true : `not a JPEG (${shot.jpegBase64.slice(0, 8)}…)`));
  await step("open internet", () => desktop.exec("curl -s -o /dev/null -w '%{http_code}' https://example.com", 30), (r) => (r.output.trim() === "200" ? true : `got ${r.output.trim()}`));
  await step("a failing command reports its code", () => desktop.exec("exit 7"), (r) => (r.code === 7 ? true : `code ${r.code}`));
  await step("open Chrome", () => desktop.exec("(setsid google-chrome https://example.com >/dev/null 2>&1 &); timeout 25 xdotool search --sync --onlyvisible --class google-chrome >/dev/null; sleep 2; xdotool getactivewindow getwindowname", 40), (r) => (/example|chrome/i.test(r.output) ? true : `front window: ${r.output.trim()}`));
  await step("read Chrome's controls", () => desktop.elements(), (els) => (els.length > 0 ? true : "no controls found") );
  await step("no keyring or other dialog in front", () => desktop.exec("xdotool getwindowfocus getwindowname"), (r) => (/keyring|password/i.test(r.output) ? `dialog: ${r.output.trim()}` : true));
  await step("type into the address bar", async () => {
    await desktop.hotkey("ctrl+l");
    await desktop.type("example.org it's");
    await desktop.press("escape");
    return true;
  });
  await step("click and scroll", async () => {
    await desktop.click(512, 400);
    await desktop.scroll(512, 400, "down", 2);
    return true;
  });
  await step("caption", () => desktop.caption("Smoke test · checking the caption").then(() => desktop.exec("cat /tmp/mates-caption")), (r) => (r.output.includes("checking the caption") ? true : r.output));
  const view = await step("watch-only live link", () => e2b.liveUrl(id, true));
  const control = await step("control live link", () => e2b.liveUrl(id, false));
  if (view && control) {
    await step("live page loads", () => fetch(view.url).then((res) => res.status), (status) => (status === 200 ? true : `HTTP ${status}`));
    await step("passwords set per role", () => desktop.exec("sed -n '1p;2p;3p' ~/.mates/vncpasswd"), (r) => {
      const [c, marker, v] = r.output.trim().split("\n");
      return c === control.token.split(":")[1] && marker === "__BEGIN_VIEWONLY__" && v === view.token.split(":")[1] ? true : "password file doesn't match the links";
    });
    await step("expire the control link", () => e2b.expireLiveUrl(id, control.token).then(() => desktop.exec("sed -n 1p ~/.mates/vncpasswd")), (r) => (r.output.trim() !== control.token.split(":")[1] ? true : "control password unchanged"));
  }
  const recording = await step("start a recording", () => desktop.startRecording("smoke test"), (rec) => (rec ? true : "no recording id"));
  if (recording) {
    await desktop.exec("sleep 2");
    await step("stop the recording", () => desktop.stopRecording(recording), (file) => (file?.endsWith(".mp4") ? true : `no file (${file})`));
  }
  await step("pause (stop)", () => e2b.stopDesktop(id));
  await step("state is stopped", () => e2b.desktopState(id), (state) => (state === "stopped" ? true : `state ${state}`));
  const back = await step("resume (start)", () => e2b.startDesktop(id));
  if (back) await step("Chrome still open after resume", () => back.exec("pgrep -c chrome"), (r) => (Number(r.output.trim()) > 0 ? true : "Chrome is gone"));
  await step("state is started", () => e2b.desktopState(id), (state) => (state === "started" ? true : `state ${state}`));
  await step("keep alive", () => e2b.keepDesktopAlive(id));
} finally {
  await step("delete", () => e2b.deleteDesktop(id));
  await step("state is gone", () => e2b.desktopState(id), (state) => (state === "gone" ? true : `state ${state}`));
}
process.exit(failed ? 1 : 0);
