import { contrast, mix } from "@muse-clone/decks";
import type { Block, BlockOf, PageDoc, Source, ThemeName } from "./schema.js";

/**
 * Draws a page as one self-contained HTML document: inline CSS, charts as inline SVG, system fonts
 * (nothing to download), and a few lines of script only for ticking a checklist.
 *
 * The look follows Notion: content sits on the page rather than in boxes, a big emoji and a bold
 * title, quiet properties under it, warm greys, thin rules, callouts with an icon on a soft tint,
 * simple tables with a light grid, gallery cards with grey tags. The mate's colour is a single
 * accent for ticked boxes and the point a chart makes. Everything from the document is escaped;
 * links must be http(s).
 */

/** `a` moved toward `b` by `t` (0 = a, 1 = b). Decks' `mix(a, b, amount)` weighs `a` by `amount`. */
const toward = (a: string, b: string, t: number) => mix(a, b, 1 - t);

export type Theme = {
  bg: string; ink: string; muted: string; faint: string; rule: string; soft: string;
  callout: string; tip: string; warning: string; tag: string; tagInk: string;
  dark: boolean; body: string; heading: string; numbers: string;
};

const SANS = `ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"`;
const SERIF = `"Lyon-Text", Georgia, "Iowan Old Style", "Palatino Linotype", serif`;
const MONO = `"iawriter-mono", Nitti, Menlo, Courier, monospace`;

// Notion's own greys: warm, quiet, and readable. Paper is its default page, Ink its dark mode, Warm
// its serif font, Ledger its monospace figures for trackers and budgets.
const LIGHT = { bg: "#FFFFFF", ink: "#37352F", muted: "#787774", faint: "#A6A299", rule: "#E9E9E7", soft: "#F7F7F5", callout: "#F1F1EF", tip: "#EDF3EC", warning: "#FBF3DB", tag: "#E3E2E0", tagInk: "#32302C", dark: false } as const;
export const THEME_TOKENS: Record<ThemeName, Theme> = {
  paper: { ...LIGHT, body: SANS, heading: SANS, numbers: SANS },
  ink: { bg: "#191919", ink: "#D4D4D4", muted: "#9B9B9B", faint: "#5A5A5A", rule: "#2F2F2F", soft: "#202020", callout: "#252525", tip: "#1F2B23", warning: "#2E2817", tag: "#373737", tagInk: "#D4D4D4", dark: true, body: SANS, heading: SANS, numbers: SANS },
  warm: { ...LIGHT, bg: "#FBFAF7", soft: "#F4F3EF", body: SERIF, heading: SERIF, numbers: SERIF },
  ledger: { ...LIGHT, body: SANS, heading: SANS, numbers: MONO },
};

/** The mate's colour, darkened or lightened until it reads on the page (3:1 for marks). */
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
    const cx = 130, cy = 130, r = 124, inner = 82;
    let angle = -Math.PI / 2;
    const shades = values.map((_, i) => (i === block.highlight ? ctx.accent : toward(ctx.theme.ink, ctx.theme.bg, 0.2 + (0.55 * i) / Math.max(1, values.length - 1))));
    values.forEach((value, i) => {
      const sweep = (value / total) * Math.PI * 2;
      if (sweep <= 0) return;
      const end = angle + Math.min(sweep, Math.PI * 2 - 0.0001);
      const large = sweep > Math.PI ? 1 : 0;
      const p = (rad: number, radius: number) => `${(cx + radius * Math.cos(rad)).toFixed(2)} ${(cy + radius * Math.sin(rad)).toFixed(2)}`;
      body += `<path d="M ${p(angle, r)} A ${r} ${r} 0 ${large} 1 ${p(end, r)} L ${p(end, inner)} A ${inner} ${inner} 0 ${large} 0 ${p(angle, inner)} Z" fill="${shades[i]}" stroke="${ctx.theme.bg}" stroke-width="3"/>`;
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
      body += `<text x="${(pad.l + step * (i + 0.5)).toFixed(1)}" y="${H - pad.b + 20}" font-size="12.5" fill="${i === block.highlight ? ctx.theme.ink : muted}" text-anchor="middle"${i === block.highlight ? ' font-weight="600"' : ""}>${escape(l)}</text>`;
    });
    if (block.kind === "bar") {
      const groupW = step * 0.62;
      const barW = groupW / block.series.length;
      block.series.forEach((s, si) => s.values.forEach((v, i) => {
        const x = pad.l + step * i + (step - groupW) / 2 + barW * si;
        const top = Math.min(y(v), y(0));
        const height = Math.max(1, Math.abs(y(v) - y(0)));
        const fill = i === block.highlight && block.series.length === 1 ? ctx.accent : colors[si];
        body += `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${Math.max(2, barW - 3).toFixed(1)}" height="${height.toFixed(1)}" rx="2" fill="${fill}"/>`;
      }));
    } else {
      block.series.forEach((s, si) => {
        const points = s.values.map((v, i) => `${(pad.l + step * (i + 0.5)).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
        body += `<polyline points="${points}" fill="none" stroke="${si === 0 && block.highlight === null ? ctx.accent : colors[si]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
        if (block.highlight !== null && s.values[block.highlight] !== undefined) body += `<circle cx="${(pad.l + step * (block.highlight + 0.5)).toFixed(1)}" cy="${y(s.values[block.highlight]!).toFixed(1)}" r="4.5" fill="${ctx.accent}"/>`;
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

const CALLOUT_ICON = { info: "📌", tip: "💡", warning: "⚠️" } as const;

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
      return `<aside class="callout ${block.tone}"><span class="icon" aria-hidden="true">${CALLOUT_ICON[block.tone]}</span><div>${block.title ? `<strong>${escape(block.title)}</strong>` : ""}<p>${inline(block.text)}</p></div></aside>`;
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
      return `<div class="metrics n${block.items.length}">${block.items.map((m) => `<div class="metric"><span class="label">${escape(m.label)}</span><span class="value">${escape(m.value)}</span>${m.note ? `<span class="note">${escape(m.note)}</span>` : ""}</div>`).join("")}</div>${sourceLine(block.cites, ctx)}`;
    case "chart":
      return `<figure class="chart">${block.title ? `<figcaption>${escape(block.title)}${block.unit ? ` <span>(${escape(block.unit)})</span>` : ""}${citations(block.cites, ctx)}</figcaption>` : ""}${chartSvg(block, ctx)}</figure>`;
    case "timeline":
      return `<ol class="timeline">${block.steps.map((s) => `<li><span class="when">${escape(s.when)}</span><div><strong>${inline(s.title)}</strong>${s.text ? `<p>${inline(s.text)}</p>` : ""}</div></li>`).join("")}</ol>`;
    case "cards":
      return `<div class="cards">${block.items.map((c) => {
        const href = safeUrl(c.url);
        return `<article class="card"><h3>${escape(c.title)}</h3><p>${inline(c.body)}</p>${c.tag || href ? `<div class="card-foot">${c.tag ? `<span class="tag">${escape(c.tag)}</span>` : ""}${href ? `<a class="open" href="${href}" rel="noopener nofollow" target="_blank">Open ↗</a>` : ""}</div>` : ""}</article>`;
      }).join("")}</div>${sourceLine(block.cites, ctx)}`;
  }
}

function sourcesList(sources: Source[]) {
  if (!sources.length) return "";
  return `<section class="sources"><h3>Sources</h3><ol>${sources.map((s, i) => {
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
  /** In the app: no footer. */
  inApp?: boolean;
  now?: number;
};

function css(t: Theme, accent: string) {
  return `
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;color-scheme:${t.dark ? "dark" : "light"}}
body{margin:0;background:${t.bg};color:${t.ink};font:400 16px/1.5 ${t.body};-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
::selection{background:${t.dark ? "#2E4A66" : "#D3E5EF"}}
main{max-width:708px;margin:0 auto;padding:72px 24px 96px}
@media(min-width:760px){main{padding-top:96px}}
a{color:inherit;text-decoration:underline;text-decoration-color:${t.faint};text-underline-offset:2px}
a:hover{text-decoration-color:${t.ink}}
header{margin-bottom:8px}
.icon-page{font-size:64px;line-height:1;margin-bottom:12px}
@media(min-width:760px){.icon-page{font-size:78px}}
h1{font:700 32px/1.2 ${t.heading};letter-spacing:-0.01em;margin:0 0 6px}
@media(min-width:760px){h1{font-size:40px}}
.description{color:${t.muted};font-size:16px;margin:4px 0 0}
.props{margin:18px 0 0;padding:0 0 14px;border-bottom:1px solid ${t.rule};font-size:14px}
.prop{display:flex;align-items:center;min-height:34px;gap:8px}
.prop .k{flex:0 0 132px;color:${t.muted};display:flex;align-items:center;gap:8px}
.prop .k svg{flex:none}
.prop .v{display:flex;align-items:center;gap:8px;min-width:0}
.prop .avatar{width:20px;height:20px;border-radius:50%;background:${accent};color:#fff;display:inline-grid;place-items:center;font-size:11px;font-weight:600}
section{margin-top:28px}
h2{font:600 24px/1.3 ${t.heading};margin:0 0 6px;letter-spacing:-0.005em}
section>*+*{margin-top:8px}
section>.table,section>.chart,section>.cards,section>.metrics,section>.callout,section>.timeline,section>blockquote{margin-top:14px}
section>.cites{margin-top:4px}
p{margin:0}
p+p{margin-top:8px}
strong{font-weight:600}
ul,ol{margin:0;padding-left:24px}
li{padding-left:2px}
li+li{margin-top:4px}
ul li::marker{color:${t.ink}}
sup.cite{font-size:11px;margin-left:2px;color:${t.muted}}
sup.cite a,.cites a{text-decoration:none;color:${t.muted}}
.cites{color:${t.muted};font-size:12px}
.checklist{list-style:none;padding:0}
.checklist li{padding:0}
.checklist li+li{margin-top:2px}
.checklist label{display:flex;gap:10px;align-items:flex-start;cursor:pointer;padding:2px 0}
.checklist input{appearance:none;-webkit-appearance:none;flex:none;width:16px;height:16px;margin:4px 0 0;border:1.5px solid ${t.ink};border-radius:3px;display:grid;place-items:center;cursor:pointer;background:transparent}
.checklist input:checked{background:${accent};border-color:${accent}}
.checklist input:checked::after{content:"";width:8px;height:4.5px;border-left:2px solid #fff;border-bottom:2px solid #fff;transform:translateY(-1px) rotate(-45deg)}
.checklist input:checked+span{color:${t.faint};text-decoration:line-through;text-decoration-color:${t.faint}}
.callout{display:flex;gap:12px;padding:16px 16px 16px 12px;border-radius:4px;background:${t.callout}}
.callout.tip{background:${t.tip}}
.callout.warning{background:${t.warning}}
.callout .icon{font-size:20px;line-height:1.2;width:24px;text-align:center;flex:none}
.callout strong{display:block;margin-bottom:2px}
blockquote{margin:0;padding:0 0 0 14px;border-left:3px solid ${t.ink}}
blockquote p{font-size:19px;line-height:1.5}
blockquote cite{display:block;margin-top:6px;color:${t.muted};font-style:normal;font-size:14px}
hr{border:0;border-top:1px solid ${t.rule};margin:16px 0}
figure{margin:0}
figcaption{font-weight:600;font-size:14px;margin-bottom:8px}
figcaption span{color:${t.muted};font-weight:400}
.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
table{border-collapse:collapse;width:100%;font-size:14px}
th,td{padding:7px 10px;text-align:left;border:1px solid ${t.rule};vertical-align:top}
th{font-weight:500;color:${t.muted};background:${t.soft};white-space:nowrap}
.num{text-align:right;font-family:${t.numbers};font-variant-numeric:tabular-nums;white-space:nowrap}
tr.total td{font-weight:600;background:${t.soft}}
.metrics{display:grid;gap:4px 24px;grid-template-columns:repeat(2,minmax(0,1fr))}
@media(min-width:440px){.metrics.n3{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(min-width:600px){.metrics.n4{grid-template-columns:repeat(4,minmax(0,1fr))}}
.metric{display:flex;flex-direction:column;padding:4px 0}
.metric .label{font-size:13px;color:${t.muted}}
.metric .value{font:600 26px/1.25 ${t.numbers};font-variant-numeric:tabular-nums;letter-spacing:-0.01em}
.metric .note{font-size:13px;color:${t.muted}}
.chart svg{display:block;width:100%;height:auto}
.legend{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:8px;color:${t.muted};font-size:13px}
.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px}
.donut{display:flex;align-items:center;gap:24px;flex-wrap:wrap}
.donut svg{flex:none;width:140px;height:140px}
.donut-legend{list-style:none;padding:0;flex:1;min-width:180px;font-size:14px}
.donut-legend li{display:flex;align-items:center;gap:10px;padding:0}
.donut-legend li+li{margin-top:6px}
.donut-legend i{width:10px;height:10px;border-radius:2px;flex:none}
.donut-legend span{flex:1}
.donut-legend b{font-weight:500;font-family:${t.numbers};font-variant-numeric:tabular-nums}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.timeline{list-style:none;padding:0}
.timeline li{display:grid;grid-template-columns:96px 1fr;gap:12px;padding:8px 0;border-top:1px solid ${t.rule}}
.timeline li:last-child{border-bottom:1px solid ${t.rule}}
.timeline li+li{margin-top:0}
.timeline .when{color:${t.muted};font-size:14px;padding-top:1px;font-variant-numeric:tabular-nums}
.timeline p{color:${t.muted};font-size:15px;margin-top:2px}
.cards{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(210px,1fr))}
.card{padding:12px 14px;border-radius:6px;border:1px solid ${t.rule};display:flex;flex-direction:column;gap:4px;background:${t.bg}}
.card h3{font:600 15px/1.35 ${t.heading};margin:0}
.card p{color:${t.muted};font-size:14px;line-height:1.45}
.card-foot{display:flex;align-items:center;gap:10px;margin-top:6px}
.card .tag{font-size:12px;line-height:1;padding:4px 6px;border-radius:3px;background:${t.tag};color:${t.tagInk};white-space:nowrap}
.card .open{margin-left:auto;font-size:13px;color:${t.muted};text-decoration:none}
.card .open:hover{color:${t.ink}}
.sources{margin-top:40px}
.sources h3{font-size:14px;font-weight:600;color:${t.muted};margin:0 0 6px}
.sources ol{color:${t.muted};font-size:14px}
footer{margin-top:56px;color:${t.faint};font-size:13px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
footer a{color:${t.muted};text-decoration:none}
footer a:hover{color:${t.ink}}
@media print{body{background:#fff}main{padding:0}footer{display:none}}
`;
}

// Ticks a checklist in this reader's browser only; the list itself changes only through the mate.
const SCRIPT = `document.querySelectorAll('.checklist input').forEach(function(box){var k='mates:'+box.dataset.key;try{var v=localStorage.getItem(k);if(v!==null)box.checked=v==='1'}catch(e){}box.addEventListener('change',function(){try{localStorage.setItem(k,box.checked?'1':'0')}catch(e){}})})`;

// Notion-style property icons: a person and a clock, 16px, drawn in the muted grey.
const PERSON = (c: string) => `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="5.5" r="2.75" fill="none" stroke="${c}" stroke-width="1.3"/><path d="M2.75 13.5c.6-2.6 2.7-4 5.25-4s4.65 1.4 5.25 4" fill="none" stroke="${c}" stroke-width="1.3" stroke-linecap="round"/></svg>`;
const CLOCK = (c: string) => `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.75" fill="none" stroke="${c}" stroke-width="1.3"/><path d="M8 5v3.25l2.1 1.4" fill="none" stroke="${c}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** The whole page as an HTML document. */
export function renderPage(doc: PageDoc, options: RenderOptions): string {
  const theme = THEME_TOKENS[doc.theme] ?? THEME_TOKENS.paper;
  const accent = accentFor(options.mate.color, theme);
  const sourceNumber = new Map(doc.sources.map((s, i) => [s.id, i + 1]));
  const ctx: Ctx = { theme, accent, sourceNumber };
  const description = doc.subtitle ?? `A page by ${options.mate.name} on Mates`;
  const props = [
    `<div class="prop"><span class="k">${PERSON(theme.muted)}Made by</span><span class="v"><span class="avatar" aria-hidden="true">${escape(options.mate.name.charAt(0).toUpperCase())}</span>${escape(options.mate.name)}</span></div>`,
    options.updatedAt ? `<div class="prop"><span class="k">${CLOCK(theme.muted)}Last edited</span><span class="v">${escape(ago(options.updatedAt, options.now))}${options.summary ? ` · ${escape(options.summary)}` : ""}</span></div>` : "",
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
${doc.emoji ? `<div class="icon-page" aria-hidden="true">${escape(doc.emoji)}</div>` : ""}
<h1>${escape(doc.title)}</h1>
${doc.subtitle ? `<p class="description">${escape(doc.subtitle)}</p>` : ""}
<div class="props">${props}</div>
</header>
${sections}
${sourcesList(doc.sources)}
${options.inApp ? "" : `<footer><span>Made with Mates</span><a href="https://agents.askorin.app" rel="noopener">Get your own mate →</a></footer>`}
</main>
<script>${SCRIPT}</script>
</body>
</html>`;
}
