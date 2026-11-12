/**
 * Builds five fixed decks with the real model and writes each as .json, .pptx and an HTML preview
 * of every slide, to review (and open in PowerPoint, Keynote and Google Slides) before a release.
 * Costs a few cents.
 *   pnpm tsx --env-file=.env scripts/golden-decks.ts <out-dir> [name…]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CANVAS, EMPTY_META, sceneHtml, sceneOf, type DeckMeta } from "@muse-clone/decks";
import { renderPptx } from "../src/deck-pptx.js";
import { buildDeck, sourcesOf, tableFact } from "../src/decks.js";
import type { DeckRequest } from "../src/db/schema.js";
import { gradientOf } from "../src/mates.js";

type Table = { title: string; columns: string[]; rows: (string | number)[][]; url: string | null };
type Golden = { name: string; color: string; mode: "light" | "dark"; meta: DeckMeta; request: Omit<DeckRequest, "facts"> & { facts: DeckRequest["facts"]; tables?: Table[] } };

const GOLDEN: Golden[] = [
  {
    name: "mates-pitch",
    color: "blue",
    mode: "light",
    meta: { wordmark: "Mates", event: "Seed round · 2026", presenter: "Orin" },
    request: {
      topic: "Investor pitch for Mates by Orin: AI teammates (\"mates\") each person creates and names. Mates chat, do tasks across 1,000+ connected apps with the user's approval, take voice calls, join Google Meet/Zoom/Teams meetings as themselves (name, animated face, voice) and send notes after, work in Slack, write and ship code as pull requests, and now make slide decks. Raising a seed round to grow in Africa and beyond.",
      audience: "seed investors",
      slideCount: 12,
      facts: [
        { text: "Plans: Starter $8/month, Plus $15, Pro $40, Max $80.", url: null },
        { text: "A mate makes an 8-slide deck in about 15 seconds for under one cent of model cost.", url: null },
        { text: "Up to 5 mates on Starter and 20 on Pro; voice calls with up to 4 mates at once.", url: null },
      ],
    },
  },
  {
    name: "q3-review",
    color: "teal",
    mode: "light",
    meta: { wordmark: "Kofi Foods", event: "Q3 business review", presenter: "Operations team" },
    request: {
      topic: "Q3 business review for Kofi Foods (packaged snacks, Ghana): revenue by month, sales by channel, what worked, what didn't, and Q4 priorities (open Kumasi depot, launch plantain chips in Nigeria).",
      audience: "the board",
      slideCount: 10,
      facts: [],
      tables: [
        { title: "Revenue by month 2026 (GHS thousands)", columns: ["Month", "Revenue", "Target"], rows: [["Jul", 412, 400], ["Aug", 455, 420], ["Sep", 538, 440]], url: null },
        { title: "Q3 sales by channel (GHS thousands)", columns: ["Channel", "Sales"], rows: [["Supermarkets", 620], ["Kiosks", 410], ["Online", 205], ["Export", 170]], url: null },
        { title: "Quarterly revenue (GHS thousands)", columns: ["Quarter", "Revenue"], rows: [["Q4 2025", 1020], ["Q1 2026", 1110], ["Q2 2026", 1205], ["Q3 2026", 1405]], url: null },
      ],
    },
  },
  {
    name: "payments-flow",
    color: "green",
    mode: "light",
    meta: { wordmark: "Pesa", event: "Product review", presenter: null },
    request: {
      topic: "Explain how Pesa lets a small business pay staff and suppliers with mobile money safely: staff prepare payments, checks catch mistakes, only the owner approves, the provider pays out, everything is recorded. Money flows in from the owner's wallet, is held in the Pesa balance, and goes out to staff and suppliers. Compare Pesa with paying by hand and with a bank transfer.",
      audience: "the product team",
      slideCount: 8,
      facts: [],
    },
  },
  {
    name: "photosynthesis",
    color: "amber",
    mode: "light",
    meta: EMPTY_META,
    request: { topic: "A lesson for 14-year-olds on how photosynthesis works: what goes in, what happens in the leaf, what comes out, why it matters, a quick recap.", audience: "a secondary school class", slideCount: 8, facts: [] },
  },
  {
    name: "four-day-week",
    color: "purple",
    mode: "dark",
    meta: { wordmark: null, event: "HR leadership offsite", presenter: null },
    request: {
      topic: "What research says about four-day work weeks: productivity, wellbeing, and what companies should watch out for.",
      audience: "an HR leadership offsite",
      slideCount: 8,
      facts: [
        { text: "In the 2022 UK four-day week pilot, 56 of 61 companies continued the four-day week after the trial.", url: "https://autonomy.work/portfolio/uk4dwpilotresults/" },
        { text: "Employees in the UK pilot reported 39% less stress and 71% less burnout.", url: "https://autonomy.work/portfolio/uk4dwpilotresults/" },
        { text: "Revenue at participating companies rose 1.4% on average over the trial.", url: "https://autonomy.work/portfolio/uk4dwpilotresults/" },
      ],
    },
  },
];

/** Every slide of a deck on one page, for review in a browser. */
function previewPage(title: string, slides: string[]) {
  const scale = 0.45;
  const frames = slides
    .map((html, i) => `<figure><div style="width:${CANVAS.width * scale}px;height:${CANVAS.height * scale}px;overflow:hidden;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.15)"><div style="transform:scale(${scale});transform-origin:0 0">${html}</div></div><figcaption>${i + 1}</figcaption></figure>`)
    .join("");
  return `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="margin:24px;background:#e4e4e7;font-family:Arial"><h1 style="font-size:18px">${title}</h1><div style="display:flex;flex-wrap:wrap;gap:16px">${frames}</div>`;
}

const [out = "golden-decks", ...only] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
let total = 0;
for (const golden of GOLDEN.filter((g) => !only.length || only.includes(g.name))) {
  const started = Date.now();
  const facts = [...golden.request.facts, ...(golden.request.tables ?? []).map((table) => ({ text: tableFact(table), url: table.url }))];
  const request: DeckRequest = { topic: golden.request.topic, audience: golden.request.audience, slideCount: golden.request.slideCount, facts };
  const { deck, cost } = await buildDeck(request, { mode: golden.mode, gradient: gradientOf(golden.color) }, sourcesOf(facts), { signal: AbortSignal.timeout(240_000) }, golden.meta);
  total += cost;
  const dir = join(out, golden.name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "deck.json"), JSON.stringify(deck, null, 2));
  writeFileSync(join(dir, `${golden.name}.pptx`), await renderPptx(deck));
  const slides = deck.slides.map((_, i) => sceneHtml(sceneOf(deck, i)));
  slides.forEach((html, i) => writeFileSync(join(dir, `slide-${String(i + 1).padStart(2, "0")}.html`), `<!doctype html><meta charset="utf-8"><body style="margin:0">${html}`));
  writeFileSync(join(dir, "index.html"), previewPage(deck.title, slides));
  console.log(`${golden.name}: ${deck.slides.length} slides (${deck.slides.map((s) => s.layout).join(" ")}), ${((Date.now() - started) / 1000).toFixed(1)}s, $${cost.toFixed(4)}`);
}
console.log(`total $${total.toFixed(4)}`);
process.exit(0);
