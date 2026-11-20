import { contrast, mix } from "@muse-clone/decks";

/** `a` moved toward `b` by `t` (0 = a, 1 = b). Decks' `mix(a, b, amount)` weighs `a` by `amount`. */
const toward = (a: string, b: string, t: number) => mix(a, b, 1 - t);
import type { Block, BlockOf, PageDoc, Source, ThemeName } from "./schema.js";

/**
 * Draws a page as one self-contained HTML document: inline CSS, charts as inline SVG, system fonts
 * (nothing to download), and a few lines of script only for ticking a checklist. The look matches
 * decks: near-monochrome, thin rules, generous type, and the mate's colour as the single accent.
 * Everything from the document is escaped; links must be http(s).
 */

export type Theme = { bg: string; surface: string; ink: string; muted: string; rule: string; soft: string; dark: boolean; heading: string; body: string; numbers: string };

const SANS = `-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, "Helvetica Neue", Arial, sans-serif`;
const SERIF = `"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif`;
const MONO = `ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace`;

// Paper and Ink are the decks' light and dark palettes, so a mate's page and deck look like family.
export const THEME_TOKENS: Record<ThemeName, Theme> = {
  paper: { bg: "#FAFAFA", surface: "#FFFFFF", ink: "#18181B", muted: "#71717A", rule: "#E4E4E7", soft: "#F4F4F5", dark: false, heading: SANS, body: SANS, numbers: SANS },
  ink: { bg: "#141416", surface: "#1C1C1F", ink: "#FAFAFA", muted: "#A1A1AA", rule: "#3F3F46", soft: "#232327", dark: true, heading: SANS, body: SANS, numbers: SANS },
  warm: { bg: "#F8F7F5", surface: "#FFFFFF", ink: "#222522", muted: "#676C66", rule: "#E6E2DC", soft: "#F0EDE8", dark: false, heading: SERIF, body: SANS, numbers: SANS },
  ledger: { bg: "#F6F7F9", surface: "#FFFFFF", ink: "#18181B", muted: "#6E6E73", rule: "#E2E5EA", soft: "#EEF0F3", dark: false, heading: SANS, body: SANS, numbers: MONO },
};

/** The mate's colour, darkened or lightened until it reads on the page (3:1 for marks and links). */
export function accentFor(color: string, theme: Theme) {
  let accent = /^#[0-9a-f]{6}$/i.test(color) ? color : "#d27e41";
  for (let i = 0; i < 10 && contrast(accent, theme.bg) < 3; i++) accent = toward(accent, theme.ink, 0.15);
  return accent;
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escape = (value: string) => value.replace(/[&<>"']/g, (ch) => ESCAPES[ch]!);
const safeUrl = (value: string | null | undefined) => (value && /^https?:\/\//i.test(value) ? escape(value) : null);

/** Bold, italic and http(s) links, on already-escaped text. */
function inline(value: string) {
  return escape(value)
    .replace(/\[([^\]]{1,200})\]\((https?:\/\/[^\s)]{1,500})\)/g, (_, label: string, href: string) => `<a href="${href}" rel="noopener nofollow" target="_blank">${label}</a>`)
    .replace(/\*\*([^*]{1,400})\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]{1,400})\*/g, "$1<em>$2</em>");
}

type Ctx = { theme: Theme; accent: string; sourceNumber: Map<string, number> };

/** Citations after a block (a table, figures, cards): a small line, not a stray number. */
function sourceLine(cites: string[], ctx: Ctx) {
  const refs = cites.map((id) => ctx.sourceNumber.get(id)).filter((n): n is number => !!n);
  return refs.length ? `<p class="cites">Source${refs.length > 1 ? "s" : ""} ${refs.map((n) => `<a href="#source-${n}">${n}</a>`).join(", ")}</p>` : "";
}

function citations(cites: string[], ctx: Ctx) {
  const refs = cites.map((id) => ctx.sourceNumber.get(id)).filter((n): n is number => !!n);
  return refs.length ? `<sup class="cite">${refs.map((n) => `<a href="#source-${n}">${n}</a>`).join(" ")}</sup>` : "";
}

const isNumeric = (cell: string) => /^[\s(]*[-+]?(?:GH¢|GHS|₵|\$|£|€|USD|GBP)?\s?[\d.,]+\s?(?:%|k|m|bn|GH¢|GHS)?\)?\s*$/i.test(cell);

// ── Charts: inline SVG, near-monochrome with the accent on the highlighted label ──────────────

function seriesColors(ctx: Ctx, n: number) {
  const base = [ctx.theme.ink, toward(ctx.theme.ink, ctx.theme.bg, 0.45), toward(ctx.theme.ink, ctx.theme.bg, 0.7)];
  return base.slice(0, n);
}
/** "GH¢1,440" for currencies, "40 km" for anything else. */
const withUnit = (value: string, unit: string | null) => (!unit ? value : /^(GH¢|GHS|₵|\$|£|€|USD|GBP|EUR)$/i.test(unit.trim()) ? `${unit.trim()}${value}` : `${value} ${unit}`);
const fmt = (n: number) => (Math.abs(n) >= 1000 ? n.toLocaleString("en-GB", { maximumFractionDigits: 0 }) : String(Math.round(n * 100) / 100));

function chartSvg(block: BlockOf<"chart">, ctx: Ctx) {
  // A narrow canvas, so chart text stays readable when scaled down to a phone.
  const W = block.kind === "donut" ? 260 : 420;
  const H = 260;
  const label = escape(block.title ?? `${block.kind} chart`);
  const colors = seriesColors(ctx, block.series.length);
  const muted = ctx.theme.muted;
  const rule = ctx.theme.rule;
  let body = "";
  let donutLegend = "";

  if (block.kind === "donut") {
    const values = block.series[0]!.values.map((v) => Math.max(0, v));
    const total = values.reduce((a, b) => a + b, 0) || 1;
    const cx = 130, cy = 130, r = 124, inner = 78;
    let angle = -Math.PI / 2;
    const shades = values.map((_, i) => (i === block.highlight ? ctx.accent : toward(ctx.theme.ink, ctx.theme.bg, 0.15 + (0.6 * i) / Math.max(1, values.length - 1))));
    values.forEach((value, i) => {
      const sweep = (value / total) * Math.PI * 2;
      if (sweep <= 0) return;
      const end = angle + Math.min(sweep, Math.PI * 2 - 0.0001);
      const large = sweep > Math.PI ? 1 : 0;
      const p = (rad: number, radius: number) => `${(cx + radius * Math.cos(rad)).toFixed(2)} ${(cy + radius * Math.sin(rad)).toFixed(2)}`;
      body += `<path d="M ${p(angle, r)} A ${r} ${r} 0 ${large} 1 ${p(end, r)} L ${p(end, inner)} A ${inner} ${inner} 0 ${large} 0 ${p(angle, inner)} Z" fill="${shades[i]}" stroke="${ctx.theme.surface}" stroke-width="2"/>`;
      angle = end;
    });
    donutLegend = `<ul class="donut-legend">${block.labels.map((l, i) => `<li><i style="background:${shades[i]}"></i><span>${escape(l)}</span><b>${escape(withUnit(fmt(values[i]!), block.unit))}</b></li>`).join("")}</ul>`;
  } else {
    const pad = { l: 44, r: 8, t: 12, b: 34 };
    const all = block.series.flatMap((s) => s.values);
    const max = Math.max(0, ...all);
    const min = Math.min(0, ...all);
    const span = max - min || 1;
    const y = (v: number) => pad.t + ((max - v) / span) * (H - pad.t - pad.b);
    const plotW = W - pad.l - pad.r;
    const step = plotW / block.labels.length;
    for (let t = 0; t <= 4; t++) {
      const v = min + (span * t) / 4;
      body += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="${rule}" stroke-width="1"/><text x="${pad.l - 8}" y="${(y(v) + 4).toFixed(1)}" font-size="12" fill="${muted}" text-anchor="end">${escape(fmt(v))}</text>`;
    }
    block.labels.forEach((l, i) => {
      body += `<text x="${(pad.l + step * (i + 0.5)).toFixed(1)}" y="${H - pad.b + 20}" font-size="12.5" fill="${i === block.highlight ? ctx.accent : muted}" text-anchor="middle"${i === block.highlight ? ' font-weight="600"' : ""}>${escape(l)}</text>`;
    });
    if (block.kind === "bar") {
      const groupW = step * 0.68;
      const barW = groupW / block.series.length;
      block.series.forEach((s, si) => s.values.forEach((v, i) => {
        const x = pad.l + step * i + (step - groupW) / 2 + barW * si;
        const top = Math.min(y(v), y(0));
        const height = Math.max(1, Math.abs(y(v) - y(0)));
        const fill = i === block.highlight && block.series.length === 1 ? ctx.accent : colors[si];
        body += `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${Math.max(2, barW - 3).toFixed(1)}" height="${height.toFixed(1)}" rx="3" fill="${fill}"/>`;
      }));
    } else {
      block.series.forEach((s, si) => {
        const points = s.values.map((v, i) => `${(pad.l + step * (i + 0.5)).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
        body += `<polyline points="${points}" fill="none" stroke="${si === 0 && block.highlight === null ? ctx.accent : colors[si]}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
        if (block.highlight !== null && s.values[block.highlight] !== undefined) body += `<circle cx="${(pad.l + step * (block.highlight + 0.5)).toFixed(1)}" cy="${y(s.values[block.highlight]!).toFixed(1)}" r="5" fill="${ctx.accent}"/>`;
      });
    }
  }
  const legend = block.kind !== "donut" && block.series.length > 1
    ? `<p class="legend">${block.series.map((s, i) => `<span><i style="background:${colors[i]}"></i>${escape(s.name)}</span>`).join("")}</p>`
    : "";
  // The numbers again as a table for screen readers; the picture is decoration for them.
  const data = `<table class="sr">${block.labels.map((l, i) => `<tr><th>${escape(l)}</th>${block.series.map((s) => `<td>${escape(fmt(s.values[i] ?? 0))}</td>`).join("")}</tr>`).join("")}</table>`;
  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}" font-family="${escape(ctx.theme.body)}">${body}</svg>`;
  return block.kind === "donut" ? `<div class="donut">${svg}${donutLegend}</div>${data}` : `${svg}${legend}${data}`;
}

// ── Blocks ────────────────────────────────────────────────────────────────────────────────

function renderBlock(block: Block, ctx: Ctx, pageKey: string): string {
  switch (block.type) {
    case "text":
      return block.text.split(/\n{2,}/).map((p, i, all) => `<p>${inline(p).replace(/\n/g, "<br>")}${i === all.length - 1 ? citations(block.cites, ctx) : ""}</p>`).join("");
    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      return `<${tag}>${block.items.map((item) => `<li>${inline(item)}</li>`).join("")}</${tag}>`;
    }
    case "checklist":
      return `<ul class="checklist">${block.items.map((item, i) => {
        const key = escape(`${pageKey}:${block.id}:${i}`);
        return `<li><label><input type="checkbox" data-key="${key}"${item.done ? " checked" : ""}><span>${inline(item.text)}</span></label></li>`;
      }).join("")}</ul>`;
    case "callout":
      return `<aside class="callout ${block.tone}">${block.title ? `<strong>${escape(block.title)}</strong>` : ""}<p>${inline(block.text)}</p></aside>`;
    case "quote":
      return `<blockquote><p>${inline(block.text)}</p>${block.attribution ? `<cite>${escape(block.attribution)}</cite>` : ""}</blockquote>`;
    case "divider":
      return "<hr>";
    case "table": {
      const numeric = block.columns.map((_, c) => block.rows.every((row) => !row[c] || isNumeric(row[c]!)));
      const cell = (value: string, c: number, tag: "td" | "th") => `<${tag}${numeric[c] ? ' class="num"' : ""}>${inline(value)}</${tag}>`;
      const rows = block.rows.map((row, r) => `<tr${block.totals && r === block.rows.length - 1 ? ' class="total"' : ""}>${row.map((v, c) => cell(v, c, "td")).join("")}</tr>`).join("");
      return `<figure class="table">${block.caption ? `<figcaption>${escape(block.caption)}${citations(block.cites, ctx)}</figcaption>` : ""}<div class="scroll"><table><thead><tr>${block.columns.map((v, c) => cell(v, c, "th")).join("")}</tr></thead><tbody>${rows}</tbody></table></div>${!block.caption ? sourceLine(block.cites, ctx) : ""}</figure>`;
    }
    case "metrics":
      return `<div class="metrics n${block.items.length}">${block.items.map((m) => `<div class="metric"><span class="value">${escape(m.value)}</span><span class="label">${escape(m.label)}</span>${m.note ? `<span class="note">${escape(m.note)}</span>` : ""}</div>`).join("")}</div>${sourceLine(block.cites, ctx)}`;
    case "chart":
      return `<figure class="chart">${block.title ? `<figcaption>${escape(block.title)}${block.unit ? ` <span>(${escape(block.unit)})</span>` : ""}${citations(block.cites, ctx)}</figcaption>` : ""}${chartSvg(block, ctx)}</figure>`;
    case "timeline":
      return `<ol class="timeline">${block.steps.map((s) => `<li><span class="when">${escape(s.when)}</span><strong>${inline(s.title)}</strong>${s.text ? `<p>${inline(s.text)}</p>` : ""}</li>`).join("")}</ol>`;
    case "cards":
      return `<div class="cards">${block.items.map((c) => {
        const href = safeUrl(c.url);
        return `<article class="card">${c.tag ? `<span class="tag">${escape(c.tag)}</span>` : ""}<h3>${escape(c.title)}</h3><p>${inline(c.body)}</p>${href ? `<a class="open" href="${href}" rel="noopener nofollow" target="_blank">Open ↗</a>` : ""}</article>`;
      }).join("")}</div>${sourceLine(block.cites, ctx)}`;
  }
}

function sourcesList(sources: Source[]) {
  if (!sources.length) return "";
  return `<section class="sources"><h2>Sources</h2><ol>${sources.map((s, i) => {
    const href = safeUrl(s.url);
    return `<li id="source-${i + 1}">${href ? `<a href="${href}" rel="noopener nofollow" target="_blank">${escape(s.title)}</a>` : escape(s.title)}</li>`;
  }).join("")}</ol></section>`;
}

/** "2h ago", "yesterday", "3 Nov". */
export function ago(iso: string, now = Date.now()) {
  const minutes = Math.round((now - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  if (hours < 48) return "yesterday";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// ── The document ──────────────────────────────────────────────────────────────────────────

export type RenderOptions = {
  mate: { name: string; color: string };
  /** When the page last changed, and the change's one-line summary. */
  updatedAt: string | null;
  summary: string | null;
  /** Keys checklist ticks in the reader's browser. */
  pageKey: string;
  /** The public link, for link previews; null in the app. */
  url: string | null;
  /** Preview image for link cards. */
  image?: string | null;
  /** In the app: no footer, and the system's text size. */
  inApp?: boolean;
  now?: number;
};

function css(t: Theme, accent: string) {
  const accentSoft = toward(accent, t.bg, t.dark ? 0.78 : 0.88);
  const tip = t.dark ? "#4ade80" : "#30a46c";
  const warn = t.dark ? "#fbbf24" : "#b45309";
  return `
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;color-scheme:${t.dark ? "dark" : "light"}}
body{margin:0;background:${t.bg};color:${t.ink};font:400 17px/1.6 ${t.body};-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
main{max-width:720px;margin:0 auto;padding:40px 20px 72px}
a{color:${accent};text-underline-offset:2px}
header{margin-bottom:36px}
.emoji{display:inline-grid;place-items:center;width:52px;height:52px;border-radius:14px;background:${t.soft};font-size:28px;margin-bottom:18px}
h1{font:600 clamp(30px,6vw,42px)/1.12 ${t.heading};letter-spacing:-0.02em;margin:0 0 10px}
.subtitle{color:${t.muted};font-size:19px;line-height:1.5;margin:0 0 16px}
.meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;color:${t.muted};font-size:14px}
.meta .dot{width:8px;height:8px;border-radius:50%;background:${accent}}
section{margin-top:44px}
h2{font:600 23px/1.3 ${t.heading};letter-spacing:-0.01em;margin:0 0 16px;padding-top:14px;border-top:1px solid ${t.rule}}
section>*+*{margin-top:22px}
section>.cites{margin-top:8px}
.cites{color:${t.muted};font-size:12.5px}
.cites a{text-decoration:none}
p{margin:0}
p+p{margin-top:12px}
ul,ol{margin:0;padding-left:22px}
li+li{margin-top:6px}
sup.cite{font-size:11px;margin-left:2px}
sup.cite a{text-decoration:none}
.checklist{list-style:none;padding:0}
.checklist label{display:flex;gap:12px;align-items:flex-start;cursor:pointer}
.checklist input{appearance:none;-webkit-appearance:none;flex:none;width:20px;height:20px;margin:3px 0 0;border:1.5px solid ${t.muted};border-radius:6px;display:grid;place-items:center;cursor:pointer}
.checklist input:checked{background:${accent};border-color:${accent}}
.checklist input:checked::after{content:"";width:10px;height:6px;border-left:2px solid ${t.bg};border-bottom:2px solid ${t.bg};transform:translateY(-1px) rotate(-45deg)}
.checklist input:checked+span{color:${t.muted};text-decoration:line-through}
.callout{padding:14px 16px;border-radius:12px;background:${accentSoft};border-left:3px solid ${accent}}
.callout.tip{background:${toward(tip, t.bg, t.dark ? 0.82 : 0.9)};border-color:${tip}}
.callout.warning{background:${toward(warn, t.bg, t.dark ? 0.82 : 0.9)};border-color:${warn}}
.callout strong{display:block;margin-bottom:4px}
blockquote{margin:0;padding-left:18px;border-left:2px solid ${t.ink}}
blockquote p{font:400 22px/1.45 ${t.heading}}
blockquote cite{display:block;margin-top:8px;color:${t.muted};font-style:normal;font-size:14px}
hr{border:0;border-top:1px solid ${t.rule};margin:28px 0}
figure{margin:0}
figcaption{font-weight:600;font-size:15px;margin-bottom:10px}
figcaption span{color:${t.muted};font-weight:400}
.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid ${t.rule};border-radius:12px;background:${t.surface}}
table{border-collapse:collapse;width:100%;font-size:15px}
th,td{padding:10px 14px;text-align:left;border-bottom:1px solid ${t.rule};vertical-align:top}
th{font-weight:600;font-size:13px;color:${t.muted};white-space:nowrap}
tr:last-child td{border-bottom:0}
.num{text-align:right;font-family:${t.numbers};font-variant-numeric:tabular-nums;white-space:nowrap}
tr.total td{font-weight:600;border-top:1.5px solid ${t.ink}}
.metrics{display:grid;gap:10px;grid-template-columns:repeat(2,1fr)}
@media(min-width:440px){.metrics.n3{grid-template-columns:repeat(3,1fr)}}
@media(min-width:600px){.metrics.n4{grid-template-columns:repeat(4,1fr)}}
.metric{padding:16px;border-radius:14px;background:${t.surface};border:1px solid ${t.rule};display:flex;flex-direction:column;gap:2px}
.metric .value{font:600 26px/1.15 ${t.numbers};font-variant-numeric:tabular-nums;letter-spacing:-0.01em}
.metric .label{font-size:14px;color:${t.muted}}
.metric .note{font-size:13px;color:${accent};font-weight:600}
.chart svg{display:block;width:100%;height:auto;background:${t.surface};border:1px solid ${t.rule};border-radius:12px;padding:8px}
.donut{display:flex;align-items:center;gap:20px;flex-wrap:wrap;padding:16px;background:${t.surface};border:1px solid ${t.rule};border-radius:12px}
.donut svg{flex:none;width:150px;height:150px;border:0;padding:0;background:none}
.donut-legend{list-style:none;padding:0;flex:1;min-width:180px;font-size:15px}
.donut-legend li{display:flex;align-items:center;gap:10px}
.donut-legend i{width:12px;height:12px;border-radius:3px;flex:none}
.donut-legend span{flex:1}
.donut-legend b{font-weight:600;font-family:${t.numbers};font-variant-numeric:tabular-nums}
.legend{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:10px;color:${t.muted};font-size:13px}
.legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.timeline{list-style:none;padding:0;position:relative}
.timeline::before{content:"";position:absolute;left:5px;top:8px;bottom:8px;width:1.5px;background:${t.rule}}
.timeline li{position:relative;padding-left:28px}
.timeline li+li{margin-top:18px}
.timeline li::before{content:"";position:absolute;left:0;top:7px;width:12px;height:12px;border-radius:50%;background:${t.bg};border:2px solid ${accent}}
.timeline .when{display:block;font-size:12.5px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:${t.muted}}
.timeline p{color:${t.muted};margin-top:2px}
.cards{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}
.card{padding:16px;border-radius:14px;background:${t.surface};border:1px solid ${t.rule};display:flex;flex-direction:column;gap:6px}
.card h3{font:600 17px/1.3 ${t.heading};margin:0}
.card p{color:${t.muted};font-size:15px;line-height:1.5}
.card .tag{align-self:flex-start;font-size:12px;font-weight:600;padding:3px 9px;border-radius:999px;background:${accentSoft};color:${t.dark ? t.ink : toward(accent, t.ink, 0.35)}}
.card .open{margin-top:auto;font-size:14px;font-weight:600;text-decoration:none}
.sources ol{color:${t.muted};font-size:14px}
.sources h2{font-size:17px}
footer{margin-top:56px;padding-top:18px;border-top:1px solid ${t.rule};color:${t.muted};font-size:13.5px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
footer a{color:${t.muted}}
@media print{body{background:#fff}main{padding:0}.checklist input{border-color:#999}footer{display:none}}
`;
}

// Ticks a checklist in this reader's browser only; the list itself changes only through the mate.
const SCRIPT = `document.querySelectorAll('.checklist input').forEach(function(box){var k='mates:'+box.dataset.key;try{var v=localStorage.getItem(k);if(v!==null)box.checked=v==='1'}catch(e){}box.addEventListener('change',function(){try{localStorage.setItem(k,box.checked?'1':'0')}catch(e){}})})`;

/** The whole page as an HTML document. */
export function renderPage(doc: PageDoc, options: RenderOptions): string {
  const theme = THEME_TOKENS[doc.theme] ?? THEME_TOKENS.paper;
  const accent = accentFor(options.mate.color, theme);
  const sourceNumber = new Map(doc.sources.map((s, i) => [s.id, i + 1]));
  const ctx: Ctx = { theme, accent, sourceNumber };
  const description = doc.subtitle ?? `A page by ${options.mate.name} on Mates`;
  const meta = [
    `<span class="dot" aria-hidden="true"></span><span>${escape(options.mate.name)}</span>`,
    options.updatedAt ? `<span>· Updated ${escape(ago(options.updatedAt, options.now))}${options.summary ? ` · ${escape(options.summary)}` : ""}</span>` : "",
  ].join("");
  const sections = doc.sections.map((s) => `<section id="${escape(s.id)}"><h2>${escape(s.heading)}</h2>${s.blocks.map((b) => renderBlock(b, ctx, options.pageKey)).join("")}</section>`).join("");
  const url = safeUrl(options.url);
  const image = safeUrl(options.image ?? null);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="${theme.bg}">
<title>${escape(doc.title)}</title>
<meta name="description" content="${escape(description)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${escape(doc.title)}">
<meta property="og:description" content="${escape(description)}">
${url ? `<meta property="og:url" content="${url}">` : ""}
${image ? `<meta property="og:image" content="${image}"><meta name="twitter:card" content="summary_large_image">` : `<meta name="twitter:card" content="summary">`}
<style>${css(theme, accent)}</style>
</head>
<body>
<main>
<header>
${doc.emoji ? `<div class="emoji" aria-hidden="true">${escape(doc.emoji)}</div>` : ""}
<h1>${escape(doc.title)}</h1>
${doc.subtitle ? `<p class="subtitle">${escape(doc.subtitle)}</p>` : ""}
<div class="meta">${meta}</div>
</header>
${sections}
${sourcesList(doc.sources)}
${options.inApp ? "" : `<footer><span>Made by ${escape(options.mate.name)} on Mates</span><a href="https://agents.askorin.app" rel="noopener">Get your own mate</a></footer>`}
</main>
<script>${SCRIPT}</script>
</body>
</html>`;
}
