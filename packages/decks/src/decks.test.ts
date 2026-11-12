import { describe, expect, it } from "vitest";
import { CANVAS, contrast, deckProblems, LAYOUTS, LIMITS, overflowing, palette, sceneOf, slideProblems, type Deck, type Slide } from "./index";

/** The widest realistic text at a length: words of five letters, no short ones to wrap early. */
const longest = (length: number) => {
  let out = "";
  while (out.length < length) out += out ? " Mmmmm" : "Mmmmm";
  return out.slice(0, length).trimEnd().padEnd(length, "m");
};

/** Every layout filled to its limits. */
const worst: Record<string, Slide> = {
  title: { id: "a", notes: "", layout: "title", title: longest(LIMITS.title), subtitle: longest(LIMITS.subtitle) },
  section: { id: "b", notes: "", layout: "section", title: longest(LIMITS.sectionTitle), kicker: longest(LIMITS.kicker) },
  bullets: { id: "c", notes: "", layout: "bullets", title: longest(LIMITS.title), bullets: Array(LIMITS.bullets[1]).fill(longest(LIMITS.bullet)) },
  "two-column": {
    id: "d", notes: "", layout: "two-column", title: longest(LIMITS.title),
    left: { heading: longest(LIMITS.columnHeading), body: longest(LIMITS.columnBody) },
    right: { heading: longest(LIMITS.columnHeading), body: longest(LIMITS.columnBody) },
  },
  "big-number": { id: "e", notes: "", layout: "big-number", title: longest(LIMITS.title), value: "$1,000,000.0", label: longest(LIMITS.valueLabel), context: longest(LIMITS.valueContext), sourceIds: ["s1"], fromUser: false },
  chart: {
    id: "f", notes: "", layout: "chart", title: longest(LIMITS.title), takeaway: longest(LIMITS.takeaway), sourceIds: ["s1"], fromUser: false,
    chart: { type: "bar", unit: "%", points: Array.from({ length: LIMITS.points[1] }, (_, i) => ({ label: longest(LIMITS.pointLabel), value: i })) },
  },
  quote: { id: "g", notes: "", layout: "quote", quote: longest(LIMITS.quote), attribution: longest(LIMITS.attribution) },
  timeline: { id: "h", notes: "", layout: "timeline", title: longest(LIMITS.title), steps: Array(LIMITS.steps[1]).fill({ label: longest(LIMITS.stepLabel), text: longest(LIMITS.stepText) }) },
  comparison: {
    id: "i", notes: "", layout: "comparison", title: longest(LIMITS.title),
    columns: Array(LIMITS.columns[1]).fill({ heading: longest(LIMITS.comparisonHeading), points: Array(LIMITS.comparisonPoints[1]).fill(longest(LIMITS.comparisonPoint)) }),
  },
  closing: { id: "j", notes: "", layout: "closing", title: longest(LIMITS.title), subtitle: longest(LIMITS.closingSubtitle), contact: longest(LIMITS.contact) },
};

const sources = [{ id: "s1", title: "Statista, Online food delivery 2026", url: "https://example.com/report" }];
const themes = (["amber", "teal", "blue", "green", "purple", "rose", "slate", "sunset"] as const).map((name) => name);
const GRADIENTS: Record<(typeof themes)[number], [string, string, string]> = {
  amber: ["#e5c59e", "#d27e41", "#9A3412"],
  teal: ["#9fd8d1", "#3a9c94", "#155e63"],
  blue: ["#b9c8f5", "#5b7be0", "#26408b"],
  green: ["#cfe3a8", "#7ea33f", "#3f5a1c"],
  purple: ["#e7c3ef", "#b061c4", "#5f2370"],
  rose: ["#f6c1c7", "#e0607a", "#8f1d3a"],
  slate: ["#d5dbe3", "#7b8794", "#323f4b"],
  sunset: ["#fde68a", "#f59e0b", "#b45309"],
};

describe("the deck format", () => {
  it("covers every layout in the fit test", () => {
    expect(Object.keys(worst).sort()).toEqual([...LAYOUTS].sort());
  });

  it("accepts every layout filled to its limits", () => {
    for (const slide of Object.values(worst)) expect(slideProblems(slide, sources)).toEqual([]);
  });

  it("rejects text over a limit instead of cutting it", () => {
    const problems = slideProblems({ ...worst.bullets, title: longest(LIMITS.title + 1) }, sources);
    expect(problems.join()).toMatch(/title/);
  });

  it("rejects figures with no source unless they're the user's own", () => {
    const unsourced = { ...worst["big-number"], sourceIds: [] } as Slide;
    expect(slideProblems(unsourced, sources)).toHaveLength(1);
    expect(slideProblems({ ...unsourced, fromUser: true } as Slide, sources)).toEqual([]);
    expect(slideProblems({ ...worst.chart, sourceIds: ["s9"] } as Slide, sources)).toHaveLength(1);
  });

  it("catches duplicate slide ids", () => {
    const deck: Deck = { title: "T", theme: { mode: "light", gradient: GRADIENTS.blue }, sources, slides: [worst.title!, { ...worst.closing!, id: "a" }] };
    expect(deckProblems(deck).join()).toMatch(/duplicate/);
  });
});

describe("slide scenes", () => {
  for (const mode of ["light", "dark"] as const)
    it(`fit the longest allowed text in every box (${mode})`, () => {
      const deck = { theme: { mode, gradient: GRADIENTS.purple }, sources };
      for (const [layout, slide] of Object.entries(worst)) {
        const scene = sceneOf(deck, slide, 8, 12);
        expect(overflowing(scene.shapes).map((s) => ({ layout, s: "text" in s ? s.text.slice(0, 20) : "list" }))).toEqual([]);
        for (const shape of scene.shapes) {
          expect(shape.x).toBeGreaterThanOrEqual(0);
          expect(shape.y).toBeGreaterThanOrEqual(0);
          expect(shape.x + shape.w).toBeLessThanOrEqual(CANVAS.width);
          expect(shape.y + shape.h).toBeLessThanOrEqual(CANVAS.height);
        }
      }
    });

  it("cite their sources under figures", () => {
    const scene = sceneOf({ theme: { mode: "light", gradient: GRADIENTS.blue }, sources }, worst.chart!, 0, 3);
    expect(scene.shapes.some((s) => s.kind === "text" && s.text.startsWith("Source: Statista"))).toBe(true);
  });
});

describe("themes", () => {
  it("keep text readable for every mate colour, light and dark", () => {
    for (const name of themes)
      for (const mode of ["light", "dark"] as const) {
        const p = palette({ mode, gradient: GRADIENTS[name] });
        expect(contrast(p.ink, p.paper)).toBeGreaterThanOrEqual(7);
        expect(contrast(p.accent, p.paper), `${name} ${mode} accent`).toBeGreaterThanOrEqual(3);
        expect(contrast(p.onAccent, p.accent), `${name} ${mode} on accent`).toBeGreaterThanOrEqual(3);
        expect(contrast(p.ink, p.surface)).toBeGreaterThanOrEqual(7);
      }
  });
});
