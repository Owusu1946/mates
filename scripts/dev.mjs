import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, openSync, closeSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const apiDir = join(root, "apps/api");
const mobileDir = join(root, "apps/mobile");
const apiRequire = createRequire(join(apiDir, "package.json"));
const mobileRequire = createRequire(join(mobileDir, "package.json"));
const logDir = join(root, ".turbo");
mkdirSync(logDir, { recursive: true });
const logPath = join(logDir, "api-dev.log");
const log = openSync(logPath, "w");
console.log(`API logs: ${logPath}`);
console.log("Starting Expo with QR code and keyboard controls…\n");

const api = spawn(process.execPath, [apiRequire.resolve("tsx/cli"), "watch", "src/index.ts"], {
  cwd: apiDir,
  stdio: ["ignore", log, "inherit"],
  windowsHide: true,
});
closeSync(log);
const mobile = spawn(process.execPath, [mobileRequire.resolve("expo/bin/cli"), "start", "--port", "0", ...process.argv.slice(2)], {
  cwd: mobileDir,
  stdio: "inherit",
  windowsHide: true,
});

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of [mobile, api]) {
    if (!child.pid || child.exitCode !== null) continue;
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    } else child.kill("SIGTERM");
  }
  process.exit(code);
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
for (const child of [api, mobile]) {
  child.on("error", (error) => { console.error(error.message); stop(1); });
}
api.on("exit", (code) => {
  if (!stopping) {
    console.error(`API stopped. See ${logPath}`);
    stop(code || 1);
  }
});
mobile.on("exit", (code) => stop(code || 0));
