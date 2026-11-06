// Draws every Mates logo file from one geometry: three of the mascot's rounded hexagons locked
// like a honeycomb. Run `node brand/generate.mjs` from the repo root after changing anything here.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// The mascot's silhouette (polygon-avatar-core SHAPE.body), centred on 100,100 with radius ~98.
const HEX =
  "M94.91 4.94Q100 2 105.09 4.94L179.78 48.06Q184.87 51 184.87 56.88L184.87 143.12Q184.87 149 179.78 151.94L105.09 195.06Q100 198 94.91 195.06L20.22 151.94Q15.13 149 15.13 143.12L15.13 56.88Q15.13 51 20.22 48.06Z";
// The app's own mate colours (apps/api/src/mates.ts): amber leads, blue and green follow.
const AMBER = ["#e5c59e", "#d27e41", "#9A3412"];
const BLUE = ["#b9c8f5", "#5b7be0", "#26408b"];
const GREEN = ["#cfe3a8", "#7ea33f", "#3f5a1c"];
const INK = "#0a0a0a";

const SCALE = 0.405;
const GAP = 1.06; // a hairline of space between cells
const dx = (Math.sqrt(3) * 98 * SCALE * GAP) / 2;
const dy = 1.5 * 98 * SCALE * GAP;
const CELLS = [
  [100, 100 - dy / 2],
  [100 - dx, 100 + dy / 2],
  [100 + dx, 100 + dy / 2],
];

const gradient = (id, [a, b, c]) =>
  `<linearGradient id="${id}" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>`;

/**
 * The three cells, filled `fills`, in a `box`-unit square. The cluster spans about 70% of its own
 * 200-unit box, and its farthest corner sits 0.435 box widths from the centre, so `size` 0.92 still
 * clears a circular crop and 0.72 keeps inside Android's adaptive-icon safe zone.
 */
function mark(fills, { box = 200, size = 1 } = {}) {
  const s = (box / 200) * size;
  const offset = (box - 200 * s) / 2;
  const cells = CELLS.map(
    ([cx, cy], i) => `<path d="${HEX}" transform="translate(${cx} ${cy}) scale(${SCALE}) translate(-100 -100)" fill="${fills[i]}"/>`,
  ).join("");
  return `<g transform="translate(${offset} ${offset}) scale(${s})">${cells}</g>`;
}

const svg = (box, body, defs = "", title = "Mates") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}"><title>${title}</title><defs>${defs}</defs>${body}</svg>\n`;
const colourDefs = gradient("a", AMBER) + gradient("b", BLUE) + gradient("c", GREEN);
const colour = ["url(#a)", "url(#b)", "url(#c)"];

const files = {
  // The logo itself.
  "brand/mates-logo.svg": svg(200, mark([INK, INK, INK]), "", "Mates"),
  "brand/mates-logo-white.svg": svg(200, mark(["#fff", "#fff", "#fff"]), "", "Mates"),
  "brand/mates-mark.svg": svg(200, mark(colour), colourDefs, "Mates"),
  "brand/mates-mark-amber.svg": svg(200, mark(["url(#a)", "url(#a)", "url(#a)"]), gradient("a", AMBER), "Mates"),
  // Square tile for avatars (GitHub app, social): colour mark on white with room to breathe.
  "brand/mates-avatar.svg": svg(1024, `<rect width="1024" height="1024" fill="#fff"/>${mark(colour, { box: 1024, size: 0.92 })}`, colourDefs, "Mates"),

  // Mobile app: iOS masks the corners itself, so the icon is a full square.
  "apps/mobile/assets/icon.svg": svg(1024, `<rect width="1024" height="1024" fill="#fff"/>${mark(colour, { box: 1024, size: 0.9 })}`, colourDefs, "Mates app icon"),
  // Android adaptive icon: the mark stays inside the central safe zone.
  "apps/mobile/assets/adaptive-icon-background.svg": svg(1024, `<rect width="1024" height="1024" fill="#fff"/>`, "", "Mates adaptive icon background"),
  "apps/mobile/assets/adaptive-icon-foreground.svg": svg(1024, mark(colour, { box: 1024, size: 0.72 }), colourDefs, "Mates adaptive icon foreground"),
  "apps/mobile/assets/adaptive-icon-monochrome.svg": svg(1024, mark(["#fff", "#fff", "#fff"], { box: 1024, size: 0.72 }), "", "Mates monochrome adaptive icon"),
  "apps/mobile/assets/splash-icon.svg": svg(1024, mark(colour, { box: 1024, size: 1.1 }), colourDefs, "Mates splash mark"),
  "apps/mobile/assets/favicon.svg": svg(64, `<rect width="64" height="64" rx="14" fill="#fff"/>${mark(colour, { box: 64, size: 1.08 })}`, colourDefs, "Mates favicon"),

  // Website: the mark alone, legible on light or dark browser chrome.
  "apps/web/public/favicon.svg": svg(200, mark(colour, { size: 1.32 }), colourDefs, "Mates"),
};

for (const [path, content] of Object.entries(files)) writeFileSync(join(root, path), content);
console.log(`wrote ${Object.keys(files).length} files`);
