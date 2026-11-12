import { describe, expect, it } from "vitest";
import { CANVAS, chartShapes, contrast, deckProblems, EMPTY_META, LAYOUTS, LIMITS, overflowing, palette, sceneHtml, sceneOf, slideProblems, type ChartShape, type Deck, type Slide } from "./index";

/** The widest realistic text at a length: five-letter words with capitals, nothing short to wrap early. */
const longest = (length: number) => {
  let out = "";
  while (out.length < length) out += out ? " Mmmmm" : "Mmmmm";
  return out.slice(0, length).trimEnd().padEnd(length, "m");
};
const n = <T,>(count: number, item: (i: number) => T) => Array.from({ length: count }, (_, i) => item(i));
const base = { notes: "" };

/** Every layout filled to its limits, at the smallest and largest item counts. */
const worst: Slide[] = [
  { ...base, id: "a", layout: "title", title: longest(LIMITS.coverTitle), muted: longest(LIMITS.coverMuted) },
  { ...base, id: "b", layout: "section", title: longest(LIMITS.sectionTitle), subtitle: longest(LIMITS.sectionSubtitle) },
  { ...base, id: "c", layout: "agenda", title: longest(LIMITS.title), items: n(LIMITS.agendaItems[1], () => longest(LIMITS.agendaItem)) },
  ...[4, LIMITS.listItems[1]].map((count, i): Slide => ({ ...base, id: `d${i}`, layout: "list", title: longest(LIMITS.title), items: n(count, () => longest(LIMITS.listItem)), takeaway: longest(LIMITS.takeaway) })),
  {
    ...base, id: "e", layout: "two-column", title: longest(LIMITS.title), takeaway: longest(LIMITS.takeaway),
    columns: n(2, () => ({ label: longest(LIMITS.label), heading: longest(LIMITS.columnHeading), body: longest(LIMITS.columnBody) })),
  },
  ...[LIMITS.steps[0], LIMITS.steps[1]].map((count, i): Slide => ({ ...base, id: `f${i}`, layout: "steps", title: longest(LIMITS.title), steps: n(count, () => ({ heading: longest(LIMITS.stepHeading), text: longest(LIMITS.stepText) })), highlight: 1, takeaway: longest(LIMITS.takeaway) })),
  ...[LIMITS.nodes[0], LIMITS.nodes[1]].map((count, i): Slide => ({ ...base, id: `g${i}`, layout: "flow", title: longest(LIMITS.title), nodes: n(count, () => ({ tag: longest(LIMITS.nodeTag), heading: longest(LIMITS.nodeHeading), text: longest(LIMITS.nodeText) })), highlight: 1, takeaway: longest(LIMITS.takeaway) })),
  ...[1, 2, 3, 4].map((count): Slide => ({ ...base, id: `h${count}`, layout: "stats", title: longest(LIMITS.title), stats: n(count, () => ({ value: "$1,000,000", label: longest(LIMITS.statLabel) })), takeaway: longest(LIMITS.takeaway), sourceIds: ["s1"], fromUser: false })),
  {
    ...base, id: "i", layout: "chart", title: longest(LIMITS.title), takeaway: longest(LIMITS.takeaway), sourceIds: ["s1"], fromUser: false,
    chart: { type: "bar", unit: "%", labels: n(LIMITS.chartLabels[1], (i) => `Mmmm${String(i).padStart(2, "0")}`), series: [{ name: "Revenue", values: n(LIMITS.chartLabels[1], (i) => i * 10) }], highlight: 3 },
  },
  { ...base, id: "j", layout: "table", title: longest(LIMITS.title), headers: n(LIMITS.tableColumns[1], () => longest(LIMITS.tableHeader)), rows: n(LIMITS.tableRows[1], () => n(LIMITS.tableColumns[1], () => longest(LIMITS.tableCell))) },
  { ...base, id: "k", layout: "quote", quote: longest(LIMITS.quote), attribution: longest(LIMITS.attribution) },
  { ...base, id: "l", layout: "closing", title: longest(LIMITS.closingTitle), subtitle: longest(LIMITS.closingSubtitle), contact: longest(LIMITS.contact) },
];

const sources = [{ id: "s1", title: "Statista, Online food delivery 2026", url: "https://example.com/report" }];
const meta = { wordmark: longest(LIMITS.wordmark), event: longest(LIMITS.event), presenter: longest(LIMITS.presenter) };
const GRADIENTS: [string, string, string][] = [
  ["#e5c59e", "#d27e41", "#9A3412"],
  ["#9fd8d1", "#3a9c94", "#155e63"],
  ["#b9c8f5", "#5b7be0", "#26408b"],
  ["#cfe3a8", "#7ea33f", "#3f5a1c"],
  ["#e7c3ef", "#b061c4", "#5f2370"],
  ["#f6c1c7", "#e0607a", "#8f1d3a"],
  ["#d5dbe3", "#7b8794", "#323f4b"],
  ["#fde68a", "#f59e0b", "#b45309"],
];

describe("the deck format", () => {
  it("covers every layout in the fit test", () => {
    expect([...new Set(worst.map((s) => s.layout))].sort()).toEqual([...LAYOUTS].sort());
  });

  it("accepts every layout filled to its limits", () => {
    for (const slide of worst) expect(slideProblems(slide, sources), slide.id).toEqual([]);
  });

  it("rejects text over a limit instead of cutting it", () => {
    expect(slideProblems({ ...worst[3]!, title: longest(LIMITS.title + 1) }, sources).join()).toMatch(/title/);
  });

  it("rejects figures with no source unless they're the user's own", () => {
    const stats = worst.find((s) => s.layout === "stats")!;
    expect(slideProblems({ ...stats, sourceIds: [] } as Slide, sources)).toHaveLength(1);
    expect(slideProblems({ ...stats, sourceIds: [], fromUser: true } as Slide, sources)).toEqual([]);
    expect(slideProblems({ ...stats, sourceIds: ["s9"] } as Slide, sources)).toHaveLength(1);
  });

  it("checks chart data lines up with its labels, and highlights point at something", () => {
    const chart = worst.find((s) => s.layout === "chart") as Slide & { layout: "chart" };
    expect(slideProblems({ ...chart, chart: { ...chart.chart, series: [{ name: "A", values: [1, 2] }] } }, sources).join()).toMatch(/one value per label/);
    expect(slideProblems({ ...chart, chart: { ...chart.chart, highlight: 40 } }, sources).join()).toMatch(/highlight/);
    expect(slideProblems({ ...chart, chart: { ...chart.chart, type: "pie", series: [chart.chart.series[0]!, chart.chart.series[0]!] } }, sources).join()).toMatch(/one series/);
    expect(slideProblems({ ...chart, chart: { ...chart.chart, labels: ["A", "B"], series: [{ name: "x", values: [1.4, 1.4] }], highlight: null } }, sources).join()).toMatch(/same/);
    expect(slideProblems({ ...chart, chart: { ...chart.chart, labels: ["A", "a"], series: [{ name: "x", values: [1, 2] }], highlight: null } }, sources).join()).toMatch(/different/);
    const table = worst.find((s) => s.layout === "table") as Slide & { layout: "table" };
    expect(slideProblems({ ...table, rows: [["only one"], ...table.rows.slice(1)] }, sources).join()).toMatch(/cells/);
  });

  it("catches duplicate slide ids", () => {
    const deck: Deck = { title: "T", theme: { mode: "light", gradient: GRADIENTS[2]! }, meta: EMPTY_META, sources, slides: [worst[0]!, { ...worst.at(-1)!, id: "a" }] };
    expect(deckProblems(deck).join()).toMatch(/duplicate/);
  });
});

describe("slide scenes", () => {
  for (const mode of ["light", "dark"] as const)
    it(`fit the longest allowed text in every box (${mode})`, () => {
      const deck = { theme: { mode, gradient: GRADIENTS[4]! }, sources, meta, slides: worst };
      worst.forEach((slide, index) => {
        const scene = sceneOf(deck, index);
        expect(overflowing(scene.shapes).map((s) => `${slide.id}: ${s.runs[0]!.text.slice(0, 16)}`)).toEqual([]);
        for (const shape of scene.shapes) {
          if (shape.kind === "line") continue;
          expect(shape.x, slide.id).toBeGreaterThanOrEqual(0);
          expect(shape.y, slide.id).toBeGreaterThanOrEqual(0);
          expect(shape.x + shape.w, slide.id).toBeLessThanOrEqual(CANVAS.width);
          expect(shape.y + shape.h, slide.id).toBeLessThanOrEqual(CANVAS.height);
        }
      });
    });

  it("number sections and label the slides inside them", () => {
    const slides: Slide[] = [
      worst[0]!,
      { ...base, id: "s1", layout: "section", title: "The problem", subtitle: null },
      worst[3]!,
      { ...base, id: "s2", layout: "section", title: "Our solution", subtitle: null },
      worst[4]!,
      { ...base, id: "ag", layout: "agenda", title: "Focus areas", items: ["ignored", "too"] },
    ];
    const deck = { theme: { mode: "light" as const, gradient: GRADIENTS[0]! }, sources, meta, slides };
    const texts = (index: number) => sceneOf(deck, index).shapes.flatMap((s) => (s.kind === "text" ? [s.runs.map((r) => r.text).join("")] : []));
    expect(texts(2)).toEqual(expect.arrayContaining(["01", "The problem"]));
    expect(texts(3)).toContain("02");
    expect(texts(4)).toEqual(expect.arrayContaining(["02", "Our solution"]));
    // The agenda lists the sections, not whatever the model wrote.
    expect(texts(5)).toEqual(expect.arrayContaining(["The problem", "Our solution"]));
    expect(texts(5)).not.toContain("ignored");
  });

  it("cite their sources under figures", () => {
    const index = worst.findIndex((s) => s.layout === "chart");
    const scene = sceneOf({ theme: { mode: "light", gradient: GRADIENTS[2]! }, sources, meta: EMPTY_META, slides: worst }, index);
    expect(scene.shapes.some((s) => s.kind === "text" && s.runs[0]!.text.startsWith("Source: Statista"))).toBe(true);
  });

  it("draw charts in the accent only where highlighted, and as HTML", () => {
    const index = worst.findIndex((s) => s.layout === "chart");
    const scene = sceneOf({ theme: { mode: "light", gradient: GRADIENTS[2]! }, sources, meta: EMPTY_META, slides: worst }, index);
    const chart = scene.shapes.find((s): s is ChartShape => s.kind === "chart")!;
    const bars = chartShapes(chart).filter((s) => s.kind === "rect");
    expect(bars.filter((b) => b.kind === "rect" && b.fill === chart.colors.accent)).toHaveLength(1);
    expect(sceneHtml(scene)).toContain("<svg");
  });
});

describe("themes", () => {
  it("keep text readable for every mate colour, light and dark", () => {
    for (const gradient of GRADIENTS)
      for (const mode of ["light", "dark"] as const) {
        const p = palette({ mode, gradient });
        expect(contrast(p.ink, p.paper)).toBeGreaterThanOrEqual(7);
        expect(contrast(p.muted, p.paper)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(p.nightInk, p.night)).toBeGreaterThanOrEqual(7);
        expect(contrast(p.nightMuted, p.night)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(p.nightSoft, p.night)).toBeGreaterThanOrEqual(7);
        expect(contrast(p.accent, p.paper), `${gradient[1]} ${mode}`).toBeGreaterThanOrEqual(3);
      }
  });
});
