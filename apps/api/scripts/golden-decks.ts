/**
 * Builds five fixed decks with the real model and writes each as .json and .pptx, to open in
 * PowerPoint, Keynote and Google Slides before a release. Costs about 5¢.
 *   pnpm tsx --env-file=.env scripts/golden-decks.ts <out-dir>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderPptx } from "../src/deck-pptx.js";
import { buildDeck, sourcesOf } from "../src/decks.js";
import type { DeckRequest } from "../src/db/schema.js";
import { gradientOf } from "../src/mates.js";

const GOLDEN: { name: string; color: string; mode: "light" | "dark"; request: DeckRequest }[] = [
  {
    name: "pitch",
    color: "blue",
    mode: "light",
    request: {
      topic: "Investor pitch for Pasta Point, a delivery-only pasta kitchen in Accra that keeps pasta hot with small kitchens close to customers. Raising $150k for 3 more kitchens. Contact: hello@pastapoint.gh",
      audience: "angel investors",
      slideCount: 8,
      facts: [
        { text: "Online food delivery revenue in Ghana is projected to reach US$1.2bn in 2026.", url: "https://www.statista.com/outlook/emo/online-food-delivery/ghana" },
        { text: "We sold 1,200 bowls in our first 8 weeks from one kitchen: 180, 240, 310 and 470 bowls in weeks 2, 4, 6 and 8.", url: null },
      ],
    },
  },
  {
    name: "qbr",
    color: "teal",
    mode: "dark",
    request: {
      topic: "Q3 business review for the support team: response times improved, ticket volume up, two new hires, priorities for Q4 (self-serve help centre, weekend cover).",
      audience: "the leadership team",
      slideCount: null,
      facts: [
        { text: "Median first response time: 4.1h in Q2, 2.3h in Q3.", url: null },
        { text: "Tickets: 3,900 in Q2, 4,700 in Q3.", url: null },
        { text: "Customer satisfaction 91% in Q3.", url: null },
      ],
    },
  },
  {
    name: "lesson",
    color: "green",
    mode: "light",
    request: { topic: "A lesson for 14-year-olds on how photosynthesis works, with a quick recap and a question to think about at the end.", audience: "a secondary school class", slideCount: 7, facts: [] },
  },
  {
    name: "update",
    color: "amber",
    mode: "light",
    request: {
      topic: "Weekly project update for the mobile app redesign: what shipped (new onboarding, dark mode), what's blocked (payments SDK review), what's next (beta to 50 testers).",
      audience: "the product team",
      slideCount: 5,
      facts: [],
    },
  },
  {
    name: "research",
    color: "purple",
    mode: "dark",
    request: {
      topic: "A summary of what research says about four-day work weeks: productivity, wellbeing, and what companies should watch out for.",
      audience: "an HR leadership offsite",
      slideCount: 8,
      facts: [
        { text: "In the 2022 UK four-day week pilot, 56 of 61 companies continued the four-day week after the trial.", url: "https://autonomy.work/portfolio/uk4dwpilotresults/" },
        { text: "Employees in the UK pilot reported 39% less stress.", url: "https://autonomy.work/portfolio/uk4dwpilotresults/" },
      ],
    },
  },
];

const out = process.argv[2] ?? "golden-decks";
mkdirSync(out, { recursive: true });
let total = 0;
for (const golden of GOLDEN) {
  const started = Date.now();
  const { deck, cost } = await buildDeck(golden.request, { mode: golden.mode, gradient: gradientOf(golden.color) }, sourcesOf(golden.request.facts), { signal: AbortSignal.timeout(180_000) });
  total += cost;
  writeFileSync(join(out, `${golden.name}.json`), JSON.stringify(deck, null, 2));
  writeFileSync(join(out, `${golden.name}.pptx`), await renderPptx(deck));
  console.log(`${golden.name}: ${deck.slides.length} slides, ${((Date.now() - started) / 1000).toFixed(1)}s, $${cost.toFixed(4)}`);
}
console.log(`total $${total.toFixed(4)}`);
process.exit(0);
