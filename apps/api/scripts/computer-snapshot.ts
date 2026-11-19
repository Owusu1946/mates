/**
 * Builds the Daytona snapshot every user's desktop starts from.
 *   pnpm exec tsx scripts/computer-snapshot.ts [name]     (default: mates-desktop-<SNAPSHOT_VERSION>)
 * Then set DAYTONA_SNAPSHOT to the printed name on the API and the worker. Existing desktops keep
 * their old snapshot; only new ones use the new image.
 *
 * Base: daytonaio/sandbox:0.11.0, Daytona's desktop image (Debian 13, xfce, noVNC, Chromium), the
 * image `computerUse.start()` expects. On top: LibreOffice for the files people actually send,
 * fonts, OCR, Chromium with accessibility on (so the agent can read page controls), and the
 * caption bar.
 */
import "../src/load-env.js";
import { Daytona, Image } from "@daytonaio/sdk";

/** Bump on purpose when the image changes; a rebuild must never quietly change a desktop. */
const SNAPSHOT_VERSION = 2;
const BASE = "daytonaio/sandbox:0.11.0";

const name = process.argv[2] ?? `mates-desktop-${SNAPSHOT_VERSION}`;
if (!process.env.DAYTONA_API_KEY) {
  console.error("Set DAYTONA_API_KEY in apps/api/.env first (Daytona dashboard → API Keys).");
  process.exit(1);
}

const image = Image.base(BASE)
  .runCommands(
    "sudo apt-get update",
    "sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends libreoffice-calc libreoffice-writer libreoffice-impress libreoffice-gtk3 fonts-noto-core fonts-noto-color-emoji tesseract-ocr xdotool x11-utils python3-tk jq ffmpeg chromium-sandbox",
    "sudo rm -rf /var/lib/apt/lists/*",
    // chromium-sandbox lets Chromium keep its own sandbox inside the container (it won't start without it).
    // Chromium exposes page controls to AT-SPI only with this flag; the agent reads them as elements.
    "echo 'export CHROMIUM_FLAGS=\"$CHROMIUM_FLAGS --force-renderer-accessibility --no-first-run --no-default-browser-check\"' | sudo tee /etc/chromium.d/mates",
    "sudo ln -sf /usr/share/zoneinfo/Africa/Accra /etc/localtime",
    "sudo mkdir -p /home/daytona/Shared /home/daytona/Mates && sudo chown -R daytona:daytona /home/daytona/Shared /home/daytona/Mates",
  )
  .addLocalFile("scripts/computer/mates-caption.py", "/usr/local/bin/mates-caption")
  // Starts the caption bar with the desktop session.
  .addLocalFile("scripts/computer/mates-caption.desktop", "/etc/xdg/autostart/mates-caption.desktop");

if (process.argv.includes("--print")) {
  console.log(image.dockerfile);
  process.exit(0);
}

const daytona = new Daytona({ apiKey: process.env.DAYTONA_API_KEY, target: process.env.DAYTONA_TARGET || "eu" });
console.log(`Building snapshot ${name} from ${BASE}…`);
await daytona.snapshot.create(
  // 10 GB is the per-sandbox disk limit on the current Daytona plan; raise it with the plan.
  { name, image, resources: { cpu: 4, memory: 8, disk: 10 } },
  { onLogs: (line) => process.stdout.write(line), timeout: 0 },
);
console.log(`\nSnapshot ready: ${name}\nSet DAYTONA_SNAPSHOT=${name} on the API and the worker.`);
