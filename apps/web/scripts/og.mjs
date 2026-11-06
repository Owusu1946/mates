// Renders the link-preview image and the PNG icons from the site itself:
//   public/og.png             1200x630, from the /og page
//   public/apple-touch-icon.png 180x180 and public/icon-192.png, from brand/mates-avatar.svg
// It builds the site, serves dist/ with a small static server, and screenshots with a local
// Chromium (Edge or Chrome).
// Set BROWSER to the browser's path if it is not found. Run: pnpm --filter @muse-clone/web og
import { execFile, execSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const brand = join(web, "..", "..", "brand");
const PORT = 4391;

const candidates = [
  process.env.BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
const browser = candidates.find((path) => existsSync(path));
if (!browser) throw new Error("No Chrome or Edge found. Set BROWSER to its path.");

const profile = mkdtempSync(join(tmpdir(), "mates-og-"));
/** Screenshots `url` at a CSS viewport of width x height, scaled by `scale` into the output. */
// Async on purpose: the static server below must keep answering while the browser loads.
async function shot(url, out, width, height, scale = 1, wait = 4000) {
  await promisify(execFile)(browser, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    `--user-data-dir=${profile}`,
    "--allow-file-access-from-files",
    `--force-device-scale-factor=${scale}`,
    `--window-size=${width},${height}`,
    `--virtual-time-budget=${wait}`,
    `--screenshot=${out}`,
    url,
  ]);
  console.log(`wrote ${out} (${Math.round(statSync(out).size / 1024)} KB)`);
}

execSync("pnpm exec astro build", { cwd: web, stdio: "inherit" });

// Just enough of a static server for dist/: files, and folder/index.html for routes.
const dist = join(web, "dist");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  let file = join(dist, path);
  if (!file.startsWith(dist) || !existsSync(file)) return res.writeHead(404).end();
  if (statSync(file).isDirectory()) file = join(file, "index.html");
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
});
await new Promise((resolve) => server.listen(PORT, "127.0.0.1", resolve));
try {
  await shot(`http://127.0.0.1:${PORT}/og/`, join(web, "public", "og.png"), 1200, 630);
  // Chromium won't open a window under ~500px, so icons render at 500 and scale down.
  const avatar = pathToFileURL(join(brand, "mates-avatar.svg")).href;
  await shot(avatar, join(web, "public", "apple-touch-icon.png"), 500, 500, 180 / 500, 500);
  await shot(avatar, join(web, "public", "icon-192.png"), 500, 500, 192 / 500, 500);
} finally {
  server.close();
  rmSync(profile, { recursive: true, force: true });
}
