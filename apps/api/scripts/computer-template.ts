/**
 * Builds the E2B template every user's desktop starts from.
 *   pnpm exec tsx scripts/computer-template.ts [name]     (default: mates-desktop-v<TEMPLATE_VERSION>)
 * Then set E2B_TEMPLATE to the printed name on the API and the worker. Existing desktops keep the
 * template they were made from; only new ones use the new build.
 *
 * Base: E2B's `desktop` template (github.com/e2b-dev/desktop, template/template.py): Ubuntu 22.04,
 * xfce, Google Chrome, LibreOffice, x11vnc, noVNC at /opt/noVNC, xdotool, scrot, ffmpeg, user `user`.
 * On top: fonts, OCR, the accessibility stack (so the agent can read page controls), the caption
 * bar, and `mates-desktop`, which the start command runs so the snapshot is taken with the desktop
 * already on: a new computer is ready the moment it's created.
 */
import "../src/load-env.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Template, defaultBuildLogger, waitForPort } from "e2b";

/** Bump on purpose when the image changes; a rebuild must never quietly change a desktop. */
const TEMPLATE_VERSION = 1;
/** 4 vCPU and 8 GB, as on Daytona: Chrome with a few tabs and LibreOffice stay quick. */
const CPU = 4;
const MEMORY_MB = 8192;

const name = process.argv.slice(2).find((arg) => !arg.startsWith("--")) ?? `mates-desktop-v${TEMPLATE_VERSION}`;
if (!process.env.E2B_API_KEY) {
  console.error("Set E2B_API_KEY in apps/api/.env first (E2B dashboard → API Keys).");
  process.exit(1);
}

const template = Template({ fileContextPath: path.join(path.dirname(fileURLToPath(import.meta.url)), "computer") })
  .fromTemplate("desktop")
  .setUser("root")
  // iproute2 for `ss`, which waitForPort uses.
  .aptInstall(["fonts-noto-core", "fonts-noto-color-emoji", "tesseract-ocr", "python3-tk", "python3-pyatspi", "at-spi2-core", "jq", "tzdata", "iproute2"], { noInstallRecommends: true })
  .copy("mates-desktop", "/usr/local/bin/mates-desktop", { mode: 0o755 })
  .copy("mates-a11y.py", "/usr/local/bin/mates-a11y", { mode: 0o755 })
  .copy("mates-caption.py", "/usr/local/bin/mates-caption", { mode: 0o755 })
  // Starts the caption bar with the desktop session.
  .copy("mates-caption.desktop", "/etc/xdg/autostart/mates-caption.desktop", { mode: 0o644 })
  // Chrome with page controls exposed to the agent; `chromium` starts it too.
  .copy("google-chrome", "/usr/local/bin/google-chrome", { mode: 0o755 })
  .runCmd([
    // A Windows checkout can give the scripts CRLF line endings, which bash can't run.
    "sed -i 's/\\r$//' /usr/local/bin/mates-desktop /usr/local/bin/mates-a11y /usr/local/bin/mates-caption /usr/local/bin/google-chrome /etc/xdg/autostart/mates-caption.desktop",
    "ln -sf /usr/local/bin/google-chrome /usr/local/bin/chromium",
    // Menu and default-browser launches go through the same flags.
    "sed -i 's#/usr/bin/google-chrome-stable#/usr/local/bin/google-chrome#g' /usr/share/applications/google-chrome.desktop",
    "update-alternatives --install /usr/bin/x-www-browser x-www-browser /usr/local/bin/google-chrome 300",
    "update-alternatives --set x-www-browser /usr/local/bin/google-chrome",
    // Never lock the screen: someone may be watching, and a mate has no password to type.
    "rm -f /etc/xdg/autostart/xfce4-screensaver.desktop /etc/xdg/autostart/xscreensaver.desktop /etc/xdg/autostart/light-locker.desktop",
    "ln -sf /usr/share/zoneinfo/Africa/Accra /etc/localtime && echo Africa/Accra > /etc/timezone",
  ])
  .setUser("user")
  // Screensaver and power manager settings: never blank, never lock.
  .copy(["xfce4-screensaver.xml", "xfce4-power-manager.xml"], "/home/user/.config/xfce4/xfconf/xfce-perchannel-xml/", { user: "user", mode: 0o644 })
  .runCmd([
    "mkdir -p /home/user/Shared /home/user/Mates/recordings /home/user/.config",
    // Links and files open in Chrome, where the user's logins are.
    "printf '[Default Applications]\\ntext/html=google-chrome.desktop\\nx-scheme-handler/http=google-chrome.desktop\\nx-scheme-handler/https=google-chrome.desktop\\n' > /home/user/.config/mimeapps.list",
  ])
  .setWorkdir("/home/user")
  .setStartCmd("mates-desktop run", waitForPort(6080));

console.log(`Building template ${name} (${CPU} vCPU, ${MEMORY_MB} MB) from E2B's desktop template…`);
const build = await Template.build(template, name, { cpuCount: CPU, memoryMB: MEMORY_MB, onBuildLogs: defaultBuildLogger() });
console.log(`\nTemplate ready: ${name} (${build.templateId})\nSet E2B_TEMPLATE=${name} on the API and the worker.`);
