import { z } from "zod";

/**
 * Mates' decks. A mate fills in a validated deck document; code we own lays every slide out as
 * shapes on a 1280×720 canvas, which the app, PowerPoint and HTML all draw. The look is editorial:
 * large regular-weight type, near-monochrome, thin rules, emphasis by inversion, and the mate's
 * colour as a single accent (highlighted chart marks, the wordmark's dot).
 *
 * Text limits are hard: text over them goes back to the model to tighten, it is never shrunk or
 * cut. Optional fields are nullable rather than absent, so the same shapes work as strict JSON
 * schemas for the model.
 */

// ==== schema ===================================================================================

export const LIMITS = {
  title: 60,
  coverTitle: 44,
  coverMuted: 26,
  sectionTitle: 50,
  sectionSubtitle: 100,
  label: 24,
  agendaItem: 34,
  agendaItems: [2, 8],
  listItem: 70,
  listItems: [2, 8],
  columnHeading: 40,
  columnBody: 220,
  stepHeading: 18,
  stepText: 60,
  steps: [3, 5],
  nodeTag: 12,
  nodeHeading: 18,
  nodeText: 60,
  nodes: [2, 4],
  statValue: 10,
  statLabel: 48,
  stats: [1, 4],
  chartLabel: 14,
  chartLabels: [2, 12],
  seriesName: 20,
  series: [1, 3],
  unit: 12,
  tableHeader: 24,
  tableCell: 36,
  tableColumns: [2, 4],
  tableRows: [2, 5],
  takeaway: 100,
  quote: 180,
  attribution: 60,
  closingTitle: 50,
  closingSubtitle: 120,
  contact: 60,
  notes: 700,
  slides: [3, 24],
  deckTitle: 80,
  wordmark: 24,
  event: 60,
  presenter: 60,
  sources: 12,
} as const;

const text = (max: number) => z.string().trim().min(1).max(max);
const maybe = (max: number) => text(max).nullable();
const list = <T extends z.ZodType>(item: T, [min, max]: readonly [number, number]) => z.array(item).min(min).max(max);
/** Which item is emphasised (by inversion or the accent); null for none. */
const highlight = z.number().int().min(0).nullable();

/** Which sources back a figure, or that the user gave it; checked by `slideProblems`. */
const evidence = { sourceIds: z.array(z.string().max(8)).max(4), fromUser: z.boolean() };

export const slideContent = {
  title: z.strictObject({ layout: z.literal("title"), title: text(LIMITS.coverTitle), muted: maybe(LIMITS.coverMuted) }),
  section: z.strictObject({ layout: z.literal("section"), title: text(LIMITS.sectionTitle), subtitle: maybe(LIMITS.sectionSubtitle) }),
  agenda: z.strictObject({ layout: z.literal("agenda"), title: text(LIMITS.title), items: list(text(LIMITS.agendaItem), LIMITS.agendaItems) }),
  list: z.strictObject({ layout: z.literal("list"), title: text(LIMITS.title), items: list(text(LIMITS.listItem), LIMITS.listItems), takeaway: maybe(LIMITS.takeaway) }),
  "two-column": z.strictObject({
    layout: z.literal("two-column"),
    title: text(LIMITS.title),
    columns: list(z.strictObject({ label: text(LIMITS.label), heading: text(LIMITS.columnHeading), body: text(LIMITS.columnBody) }), [2, 2]),
    takeaway: maybe(LIMITS.takeaway),
  }),
  steps: z.strictObject({
    layout: z.literal("steps"),
    title: text(LIMITS.title),
    steps: list(z.strictObject({ heading: text(LIMITS.stepHeading), text: text(LIMITS.stepText) }), LIMITS.steps),
    highlight,
    takeaway: maybe(LIMITS.takeaway),
  }),
  flow: z.strictObject({
    layout: z.literal("flow"),
    title: text(LIMITS.title),
    nodes: list(z.strictObject({ tag: text(LIMITS.nodeTag), heading: text(LIMITS.nodeHeading), text: text(LIMITS.nodeText) }), LIMITS.nodes),
    highlight,
    takeaway: maybe(LIMITS.takeaway),
  }),
  stats: z.strictObject({
    layout: z.literal("stats"),
    title: text(LIMITS.title),
    stats: list(z.strictObject({ value: text(LIMITS.statValue), label: text(LIMITS.statLabel) }), LIMITS.stats),
    takeaway: maybe(LIMITS.takeaway),
    ...evidence,
  }),
  chart: z.strictObject({
    layout: z.literal("chart"),
    title: text(LIMITS.title),
    chart: z.strictObject({
      type: z.enum(["bar", "stacked", "line", "pie"]),
      unit: maybe(LIMITS.unit),
      labels: list(text(LIMITS.chartLabel), LIMITS.chartLabels),
      series: list(z.strictObject({ name: text(LIMITS.seriesName), values: z.array(z.number().finite()) }), LIMITS.series),
      highlight,
    }),
    takeaway: maybe(LIMITS.takeaway),
    ...evidence,
  }),
  table: z.strictObject({
    layout: z.literal("table"),
    title: text(LIMITS.title),
    headers: list(text(LIMITS.tableHeader), LIMITS.tableColumns),
    rows: list(z.array(text(LIMITS.tableCell)), LIMITS.tableRows),
  }),
  quote: z.strictObject({ layout: z.literal("quote"), quote: text(LIMITS.quote), attribution: maybe(LIMITS.attribution) }),
  closing: z.strictObject({ layout: z.literal("closing"), title: text(LIMITS.closingTitle), subtitle: maybe(LIMITS.closingSubtitle), contact: maybe(LIMITS.contact) }),
} as const;

export type Layout = keyof typeof slideContent;
export const LAYOUTS = Object.keys(slideContent) as Layout[];

/** What each layout is for, told to the model when it plans the deck. */
export const LAYOUT_GUIDE: Record<Layout, string> = {
  title: "the cover: a short, confident line (title), optionally a second short line shown in grey (muted), like \"Your staff prepare. You approve.\" + \"MoMo pays.\"",
  section: "a dark divider that opens a part of the deck (decks of 10+ slides: 2-4 sections)",
  agenda: "what the deck covers; with sections, its items are the section names",
  list: "2-8 short parallel points, laid out as rows",
  "two-column": "two ideas side by side, each with a small label, a heading and a short paragraph",
  steps: "3-5 steps of a process in order; highlight the step that matters most",
  flow: "2-4 boxes connected by arrows (in → held → out, before → after); highlight the key box",
  stats: "1-4 headline figures with what each means (need a source or the user's own numbers)",
  chart: "a bar, stacked, line or pie chart of real data (need a source or the user's own data); highlight the bar or point that makes the point",
  table: "a comparison of 2-5 rows across 2-4 columns",
  quote: "a quotation worth the whole slide, with who said it",
  closing: "the last slide: the ask or next step, with contact details only if given",
};

const base = { id: z.string().min(1).max(40), notes: z.string().trim().max(LIMITS.notes) };

export const slideSchema = z.discriminatedUnion(
  "layout",
  LAYOUTS.map((layout) => slideContent[layout].extend(base)) as unknown as [
    z.ZodObject<{ layout: z.ZodLiteral<Layout> }>,
    ...z.ZodObject<{ layout: z.ZodLiteral<Layout> }>[],
  ],
);

type ContentOf<L extends Layout> = z.infer<(typeof slideContent)[L]>;
export type SlideContent = { [L in Layout]: ContentOf<L> }[Layout];
export type Slide = SlideContent & { id: string; notes: string };
export type SlideOf<L extends Layout> = ContentOf<L> & { id: string; notes: string };
export type ChartData = SlideOf<"chart">["chart"];

export const sourceSchema = z.strictObject({ id: z.string().max(8), title: text(120), url: z.string().url().nullable() });
export type Source = z.infer<typeof sourceSchema>;

export const themeSchema = z.strictObject({
  mode: z.enum(["light", "dark"]),
  /** The mate's three-stop gradient (light, mid, deep); its mid stop is the deck's one accent. */
  gradient: z.tuple([z.string(), z.string(), z.string()]),
});
export type ThemeInput = z.infer<typeof themeSchema>;

/** Deck-wide details shown on the cover and in the footer. */
export const metaSchema = z.strictObject({
  wordmark: maybe(LIMITS.wordmark),
  event: maybe(LIMITS.event),
  presenter: maybe(LIMITS.presenter),
});
export type DeckMeta = z.infer<typeof metaSchema>;
export const EMPTY_META: DeckMeta = { wordmark: null, event: null, presenter: null };

export const deckSchema = z.strictObject({
  title: text(LIMITS.deckTitle),
  theme: themeSchema,
  meta: metaSchema,
  slides: z.array(slideSchema).min(1).max(LIMITS.slides[1]),
  sources: z.array(sourceSchema).max(LIMITS.sources),
});
export type Deck = { title: string; theme: ThemeInput; meta: DeckMeta; slides: Slide[]; sources: Source[] };

/** Plain-language problems with one slide, for the model to fix. Empty when the slide is fine. */
export function slideProblems(slide: unknown, sources: Source[]): string[] {
  const parsed = slideSchema.safeParse(slide);
  if (!parsed.success) return parsed.error.issues.map((issue) => `${issue.path.join(".") || "slide"}: ${issue.message}`);
  const value = parsed.data as Slide;
  const problems: string[] = [];
  const outOf = (index: number | null, count: number, what: string) => {
    if (index !== null && index >= count) problems.push(`highlight ${index} is past the last ${what} (0-based, ${count} ${what}s)`);
  };
  if (value.layout === "steps") outOf(value.highlight, value.steps.length, "step");
  if (value.layout === "flow") outOf(value.highlight, value.nodes.length, "box");
  if (value.layout === "chart") {
    const { chart } = value;
    chart.series.forEach((series, i) => {
      if (series.values.length !== chart.labels.length) problems.push(`chart.series.${i}: ${series.values.length} values for ${chart.labels.length} labels; give one value per label`);
    });
    if (chart.type === "pie" && chart.series.length > 1) problems.push("a pie chart takes one series");
    if (chart.type === "pie" && chart.series[0]!.values.some((v) => v < 0)) problems.push("a pie chart can't have negative values");
    outOf(chart.highlight, chart.labels.length, "label");
    if (new Set(chart.labels.map((l) => l.toLowerCase())).size !== chart.labels.length) problems.push("chart labels must be different from each other");
    const values = chart.series.flatMap((s) => s.values);
    if (values.length > 1 && values.every((v) => v === values[0])) problems.push("every value in this chart is the same, so it says nothing; show one figure as a stats slide instead");
  }
  if (value.layout === "table")
    value.rows.forEach((row, i) => {
      if (row.length !== value.headers.length) problems.push(`rows.${i}: ${row.length} cells for ${value.headers.length} columns`);
    });
  if (value.layout === "stats" || value.layout === "chart") {
    const known = new Set(sources.map((source) => source.id));
    if (!value.fromUser && !value.sourceIds.some((id) => known.has(id)))
      problems.push("This slide shows figures but cites no source and isn't the user's own data. Cite a source id, or use a layout without figures.");
  }
  return problems;
}

/** Problems across the deck: every slide, and ids unique. */
export function deckProblems(deck: Deck): string[] {
  const problems = deck.slides.flatMap((slide, index) => slideProblems(slide, deck.sources).map((p) => `slide ${index + 1}: ${p}`));
  const ids = new Set<string>();
  for (const slide of deck.slides) {
    if (ids.has(slide.id)) problems.push(`duplicate slide id ${slide.id}`);
    ids.add(slide.id);
  }
  return problems;
}

// ==== theme ====================================================================================

/** Slide colours: neutrals carry the deck, the mate's colour is the one accent. */
export type Palette = {
  paper: string;
  ink: string;
  muted: string;
  faint: string;
  rule: string;
  /** Dark slides (cover, sections, closing) and inverted cards. */
  night: string;
  nightInk: string;
  nightMuted: string;
  /** Body text on inverted cards. */
  nightSoft: string;
  nightRule: string;
  accent: string;
  /** Chart series, strongest first. */
  series: string[];
  /** Bars that aren't the highlighted one. */
  quiet: string;
};

const channels = (hex: string) => {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? [...value].map((c) => c + c).join("") : value;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
};
const toHex = (rgb: number[]) => `#${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;

/** `amount` of `a` over `b` (0 → b, 1 → a). */
export function mix(a: string, b: string, amount: number) {
  const [x, y] = [channels(a), channels(b)];
  return toHex(x.map((c, i) => c * amount + y[i]! * (1 - amount)));
}

/** Relative luminance (WCAG), for picking readable colours. */
export function luminance(hex: string) {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
}

const LIGHT = { paper: "#FAFAFA", ink: "#18181B", muted: "#71717A", faint: "#A1A1AA", rule: "#E4E4E7", quiet: "#D4D4D8" };
const DARK = { paper: "#18181B", ink: "#FAFAFA", muted: "#A1A1AA", faint: "#71717A", rule: "#3F3F46", quiet: "#52525B" };
const NIGHT = { night: "#141416", nightInk: "#FAFAFA", nightMuted: "#8A8A93", nightSoft: "#B4B4BB", nightRule: "#3F3F46" };

export function palette(theme: ThemeInput): Palette {
  const [light, mid, deep] = theme.gradient;
  const neutrals = theme.mode === "dark" ? DARK : LIGHT;
  // The accent must read on paper: the mid stop usually does; otherwise the stop that does.
  const candidates = theme.mode === "dark" ? [mid, light] : [mid, deep];
  const accent = candidates.find((c) => contrast(c, neutrals.paper) >= 3) ?? (theme.mode === "dark" ? light : deep);
  const series = theme.mode === "dark" ? [DARK.ink, DARK.muted, DARK.quiet] : [LIGHT.ink, LIGHT.faint, LIGHT.quiet];
  return { ...neutrals, ...NIGHT, night: theme.mode === "dark" ? "#0B0B0D" : NIGHT.night, accent, series };
}

// ==== scene ====================================================================================

export const CANVAS = { width: 1280, height: 720 } as const;
const M = 96; // side margin
const W = CANVAS.width - 2 * M;

export type Align = "left" | "center" | "right";
export type VAlign = "top" | "middle" | "bottom";
type Box = { x: number; y: number; w: number; h: number };

export type Run = { text: string; color: string };
export type TextShape = Box & {
  kind: "text";
  runs: Run[];
  size: number;
  bold?: boolean;
  align?: Align;
  valign?: VAlign;
  /** Line height as a multiple of the font size. */
  leading: number;
  /** Letter spacing in px (positive for small caps labels, negative for display type). */
  tracking?: number;
};
export type RectShape = Box & { kind: "rect"; fill: string | null; stroke?: string; radius?: number };
export type LineShape = { kind: "line"; x1: number; y1: number; x2: number; y2: number; color: string; width: number; arrow?: boolean };
export type ChartShape = Box & { kind: "chart"; chart: ChartData; colors: { series: string[]; quiet: string; accent: string; ink: string; muted: string; rule: string; paper: string } };
export type Shape = TextShape | RectShape | LineShape | ChartShape;
export type Scene = { background: string; shapes: Shape[] };

/** A text shape's plain text, for measuring and accessibility. */
export const plainText = (shape: TextShape) => shape.runs.map((run) => run.text).join("");

const t = (box: Box, value: string, color: string, style: Omit<TextShape, "kind" | "runs" | keyof Box | "leading"> & { leading?: number }): TextShape => ({
  kind: "text",
  ...box,
  runs: [{ text: value, color }],
  leading: style.leading ?? 1.25,
  ...style,
});
const rule = (x: number, y: number, w: number, color: string): LineShape => ({ kind: "line", x1: x, y1: y, x2: x + w, y2: y, color, width: 1 });
const two = (n: number) => String(n).padStart(2, "0");

/** Where a slide sits in the deck's sections: "02  Our solution" above its title. */
function sectionOf(deck: Pick<Deck, "slides">, index: number) {
  let number = 0;
  let title: string | null = null;
  for (let i = 0; i <= index; i++) {
    const slide = deck.slides[i]!;
    if (slide.layout === "section") {
      number += 1;
      title = slide.title;
    }
  }
  return { number, title };
}

const sectionTitles = (deck: Pick<Deck, "slides">) => deck.slides.flatMap((slide) => (slide.layout === "section" ? [slide.title] : []));

type Kicker = { number: string; title: string } | null;

function header(title: string, kicker: Kicker, p: Palette): Shape[] {
  return [
    ...(kicker ? [t({ x: M, y: 58, w: 36, h: 24 }, kicker.number, p.faint, { size: 16, leading: 1.2 }), t({ x: M + 36, y: 58, w: W - 36, h: 24 }, kicker.title, p.muted, { size: 16, leading: 1.2 })] : []),
    t({ x: M, y: 92, w: W, h: 116 }, title, p.ink, { size: 48, leading: 1.1, tracking: -1 }),
  ];
}

const takeawayShape = (value: string | null, p: Palette): Shape[] => (value ? [t({ x: M, y: 596, w: W, h: 64 }, value, p.ink, { size: 24, leading: 1.25 })] : []);

function footer(deck: Pick<Deck, "meta">, index: number, p: Palette, sourceLine: string | null): Shape[] {
  return [
    ...(sourceLine ? [t({ x: M, y: 664, w: W - 200, h: 22 }, sourceLine, p.faint, { size: 13, leading: 1.2 })] : []),
    ...(deck.meta.wordmark && !sourceLine ? [t({ x: M, y: 664, w: 400, h: 22 }, deck.meta.wordmark.toUpperCase(), p.faint, { size: 13, bold: true, leading: 1.2, tracking: 3 })] : []),
    t({ x: CANVAS.width - M - 120, y: 664, w: 120, h: 22 }, `${index + 1}`, p.faint, { size: 13, align: "right", leading: 1.2 }),
  ];
}

function sourceLine(slide: Slide, sources: Source[]) {
  if (slide.layout !== "stats" && slide.layout !== "chart") return null;
  const names = slide.sourceIds.map((id) => sources.find((s) => s.id === id)?.title).filter(Boolean);
  if (names.length) return `Source: ${names.join("; ")}`;
  return slide.fromUser ? "Source: our data" : null;
}

/** Display figures fill their column; long values step down in size so they never wrap. */
const fitDisplay = (value: string, width: number, max: number) => Math.min(max, Math.floor(width / (Math.max(value.length, 1) * 0.62)));

/** The brand mark on dark slides: an accent dot and the wordmark in spaced capitals. */
const wordmark = (name: string, p: Palette): Shape[] => [
  { kind: "rect", x: M, y: 80, w: 14, h: 14, fill: p.accent, radius: 7 },
  t({ x: M + 28, y: 74, w: 600, h: 28 }, name.toUpperCase(), p.nightInk, { size: 20, leading: 1.3, tracking: 6 }),
];

function body(deck: Pick<Deck, "slides" | "meta">, slide: Slide, index: number, p: Palette, kicker: Kicker): Shape[] {
  switch (slide.layout) {
    case "title":
      return [
        ...(deck.meta.wordmark ? wordmark(deck.meta.wordmark, p) : []),
        {
          kind: "text",
          x: M,
          y: 268,
          w: W,
          h: 240,
          runs: [{ text: slide.title, color: p.nightInk }, ...(slide.muted ? [{ text: `\n${slide.muted}`, color: p.nightMuted }] : [])],
          size: 72,
          leading: 1.06,
          tracking: -2,
        },
        rule(M, 592, W, p.nightRule),
        ...(deck.meta.event ? [t({ x: M, y: 612, w: W / 2, h: 24 }, deck.meta.event, p.nightMuted, { size: 16, leading: 1.2 })] : []),
        ...(deck.meta.presenter ? [t({ x: M + W / 2, y: 612, w: W / 2, h: 24 }, deck.meta.presenter, p.nightMuted, { size: 16, align: "right", leading: 1.2 })] : []),
      ];
    case "section": {
      const { number } = sectionOf(deck, index);
      return [
        t({ x: M, y: 400, w: 200, h: 26 }, two(number), p.nightMuted, { size: 18, leading: 1.2 }),
        t({ x: M, y: 436, w: W, h: 140 }, slide.title, p.nightInk, { size: 60, leading: 1.08, tracking: -1.5 }),
        ...(slide.subtitle ? [t({ x: M, y: 592, w: W, h: 56 }, slide.subtitle, p.nightMuted, { size: 20, leading: 1.3 })] : []),
      ];
    }
    case "agenda": {
      const sections = sectionTitles(deck);
      const items = sections.length >= 2 ? sections.slice(0, LIMITS.agendaItems[1]) : slide.items;
      const perColumn = Math.ceil(items.length / 2);
      const colW = (W - 48) / 2;
      return [
        ...header(slide.title, kicker, p),
        ...items.flatMap((item, i): Shape[] => {
          const x = M + (i < perColumn ? 0 : colW + 48);
          const y = 252 + (i % perColumn) * 68;
          return [rule(x, y, colW, p.rule), t({ x, y: y + 20, w: 40, h: 28 }, two(i + 1), p.faint, { size: 16, leading: 1.4 }), t({ x: x + 48, y: y + 16, w: colW - 48, h: 32 }, item, p.ink, { size: 22, leading: 1.3 })];
        }),
      ];
    }
    case "list": {
      const twoColumns = slide.items.length > 4;
      const perColumn = twoColumns ? Math.ceil(slide.items.length / 2) : slide.items.length;
      const colW = twoColumns ? (W - 48) / 2 : W;
      const pitch = twoColumns ? 84 : 72;
      return [
        ...header(slide.title, kicker, p),
        ...slide.items.flatMap((item, i): Shape[] => {
          const x = M + (i < perColumn ? 0 : colW + 48);
          const y = 244 + (i % perColumn) * pitch;
          return [rule(x, y, colW, p.rule), t({ x, y: y + 16, w: colW, h: pitch - 20 }, item, p.ink, { size: 24, leading: 1.3 })];
        }),
        ...(slide.items.length ? [rule(M, 244 + perColumn * pitch, twoColumns ? colW : W, p.rule), ...(twoColumns ? [rule(M + colW + 48, 244 + (slide.items.length - perColumn) * pitch, colW, p.rule)] : [])] : []),
        ...takeawayShape(slide.takeaway, p),
      ];
    }
    case "two-column": {
      const colW = (W - 64) / 2;
      return [
        ...header(slide.title, kicker, p),
        ...slide.columns.flatMap((column, i): Shape[] => {
          const x = M + i * (colW + 64);
          return [
            rule(x, 248, colW, p.ink),
            t({ x, y: 264, w: colW, h: 20 }, column.label.toUpperCase(), p.muted, { size: 13, bold: true, leading: 1.2, tracking: 2 }),
            t({ x, y: 296, w: colW, h: 74 }, column.heading, p.ink, { size: 28, leading: 1.2, tracking: -0.5 }),
            t({ x, y: 382, w: colW, h: 196 }, column.body, p.muted, { size: 20, leading: 1.4 }),
          ];
        }),
        ...takeawayShape(slide.takeaway, p),
      ];
    }
    case "steps": {
      const n = slide.steps.length;
      const colW = W / n;
      return [
        ...header(slide.title, kicker, p),
        ...slide.steps.flatMap((step, i): Shape[] => {
          const x = M + i * colW;
          const lit = slide.highlight === i;
          return [
            lit ? { kind: "rect", x: x - 4, y: 262, w: colW + 8, h: 252, fill: p.night, radius: 12 } : rule(x, 274, colW - 16, p.rule),
            t({ x: x + 12, y: 294, w: colW - 32, h: 22 }, two(i + 1), lit ? p.nightMuted : p.faint, { size: 15, leading: 1.2 }),
            t({ x: x + 12, y: 324, w: colW - 32, h: 62 }, step.heading, lit ? p.nightInk : p.ink, { size: 24, leading: 1.2, tracking: -0.3 }),
            t({ x: x + 12, y: 394, w: colW - 32, h: 108 }, step.text, lit ? p.nightSoft : p.muted, { size: 17, leading: 1.4 }),
          ];
        }),
        ...takeawayShape(slide.takeaway, p),
      ];
    }
    case "flow": {
      const n = slide.nodes.length;
      const gap = 72;
      const nodeW = (W - gap * (n - 1)) / n;
      const y = 288;
      const h = 276;
      return [
        ...header(slide.title, kicker, p),
        ...slide.nodes.flatMap((node, i): Shape[] => {
          const x = M + i * (nodeW + gap);
          const lit = slide.highlight === i;
          return [
            { kind: "rect", x, y, w: nodeW, h, fill: lit ? p.night : null, stroke: lit ? undefined : p.rule, radius: 14 },
            t({ x: x + 24, y: y + 32, w: nodeW - 48, h: 20 }, node.tag.toUpperCase(), lit ? p.nightMuted : p.muted, { size: 13, bold: true, leading: 1.2, tracking: 2 }),
            t({ x: x + 24, y: y + 64, w: nodeW - 48, h: 64 }, node.heading, lit ? p.nightInk : p.ink, { size: 24, leading: 1.2, tracking: -0.3 }),
            t({ x: x + 24, y: y + 140, w: nodeW - 48, h: 108 }, node.text, lit ? p.nightSoft : p.muted, { size: 17, leading: 1.4 }),
            ...(i < n - 1 ? [{ kind: "line", x1: x + nodeW + 16, y1: y + h / 2, x2: x + nodeW + gap - 16, y2: y + h / 2, color: p.ink, width: 1.5, arrow: true } as const] : []),
          ];
        }),
        ...takeawayShape(slide.takeaway, p),
      ];
    }
    case "stats": {
      const n = slide.stats.length;
      if (n === 1) {
        const stat = slide.stats[0]!;
        return [
          ...header(slide.title, kicker, p),
          t({ x: M, y: 236, w: W, h: 180 }, stat.value, p.ink, { size: fitDisplay(stat.value, W, 160), leading: 1.05, tracking: -4 }),
          t({ x: M, y: 432, w: 900, h: 70 }, stat.label, p.muted, { size: 26, leading: 1.3 }),
          ...takeawayShape(slide.takeaway, p),
        ];
      }
      const colW = (W - 40 * (n - 1)) / n;
      // One size for the row (the tightest fit), so the figures line up.
      const size = Math.min(...slide.stats.map((s) => fitDisplay(s.value, colW, n === 2 ? 104 : 80)));
      const valueH = Math.ceil(size * 1.05);
      return [
        ...header(slide.title, kicker, p),
        ...slide.stats.flatMap((stat, i): Shape[] => {
          const x = M + i * (colW + 40);
          return [
            rule(x, 260, colW, p.ink),
            t({ x, y: 284, w: colW, h: valueH }, stat.value, p.ink, { size, leading: 1.05, tracking: -2 }),
            t({ x, y: 284 + valueH + 16, w: colW, h: 86 }, stat.label, p.muted, { size: 20, leading: 1.35 }),
          ];
        }),
        ...takeawayShape(slide.takeaway, p),
      ];
    }
    case "chart":
      return [
        ...header(slide.title, kicker, p),
        { kind: "chart", x: M, y: 236, w: W, h: slide.takeaway ? 340 : 400, chart: slide.chart, colors: { series: p.series, quiet: p.quiet, accent: p.accent, ink: p.ink, muted: p.muted, rule: p.rule, paper: p.paper } },
        ...takeawayShape(slide.takeaway, p),
      ];
    case "table": {
      const cols = slide.headers.length;
      const colW = W / cols;
      return [
        ...header(slide.title, kicker, p),
        ...slide.headers.map((h, c) => t({ x: M + c * colW, y: 244, w: colW - 24, h: 20 }, h.toUpperCase(), p.muted, { size: 13, bold: true, leading: 1.2, tracking: 2 })),
        rule(M, 276, W, p.ink),
        ...slide.rows.flatMap((row, r): Shape[] => [
          ...row.map((cell, c) => t({ x: M + c * colW, y: 292 + r * 64, w: colW - 24, h: 52 }, cell, c === 0 ? p.ink : p.muted, { size: 20, leading: 1.3 })),
          rule(M, 276 + (r + 1) * 64, W, p.rule),
        ]),
      ];
    }
    case "quote":
      return [
        rule(M, 196, 64, p.ink),
        t({ x: M, y: 228, w: 1000, h: 280 }, `“${slide.quote}”`, p.ink, { size: 40, leading: 1.3, tracking: -0.5 }),
        ...(slide.attribution ? [t({ x: M, y: 540, w: 1000, h: 30 }, slide.attribution, p.muted, { size: 20, leading: 1.3 })] : []),
      ];
    case "closing":
      return [
        ...(deck.meta.wordmark ? wordmark(deck.meta.wordmark, p) : []),
        t({ x: M, y: 268, w: W, h: 150 }, slide.title, p.nightInk, { size: 64, leading: 1.08, tracking: -1.5 }),
        ...(slide.subtitle ? [t({ x: M, y: 436, w: W, h: 70 }, slide.subtitle, p.nightMuted, { size: 24, leading: 1.3 })] : []),
        ...(slide.contact ? [rule(M, 556, W, p.nightRule), t({ x: M, y: 576, w: W, h: 28 }, slide.contact, p.nightInk, { size: 20, leading: 1.3 })] : []),
      ];
  }
}

const DARK_LAYOUTS: Layout[] = ["title", "section", "closing"];

/** One slide of a deck as shapes, with its background. */
export function sceneOf(deck: Pick<Deck, "theme" | "sources" | "slides" | "meta">, index: number): Scene {
  const slide = deck.slides[index]!;
  const p = palette(deck.theme);
  const dark = DARK_LAYOUTS.includes(slide.layout);
  const section = sectionOf(deck, index);
  const kicker = section.title && !dark ? { number: two(section.number), title: section.title } : null;
  const chrome = dark ? [] : footer(deck, index, p, sourceLine(slide, deck.sources));
  return { background: dark ? p.night : p.paper, shapes: [...body(deck, slide, index, p, kicker), ...chrome] };
}

// ==== charts as shapes (for renderers without native charts) ===================================

export type PathShape = { kind: "path"; d: string; fill: string };
export type CircleShape = { kind: "circle"; cx: number; cy: number; r: number; fill: string };
export type PolylineShape = { kind: "polyline"; points: [number, number][]; color: string; width: number };
export type VectorShape = RectShape | LineShape | TextShape | PathShape | CircleShape | PolylineShape;

export const formatValue = (value: number) => (Math.abs(value) >= 1000 ? Math.round(value).toLocaleString("en-US") : String(Math.round(value * 100) / 100));

/** Bar, line and pie charts drawn as simple shapes, matching the PowerPoint chart's styling. */
export function chartShapes(shape: ChartShape): VectorShape[] {
  const { chart, colors } = shape;
  const out: VectorShape[] = [];
  const multi = chart.series.length > 1;
  const label = (box: Box, value: string, color: string, size = 15, align: Align = "center", bold = false) => out.push(t(box, value, color, { size, align, leading: 1.2, bold }));

  if (multi && chart.type !== "pie") {
    // Legend, top right.
    let x = shape.x + shape.w;
    for (let i = chart.series.length - 1; i >= 0; i--) {
      const name = chart.series[i]!.name;
      const width = name.length * 8 + 40;
      x -= width;
      out.push({ kind: "rect", x, y: shape.y + 4, w: 12, h: 12, fill: colors.series[i]!, radius: 3 });
      label({ x: x + 20, y: shape.y, w: width - 20, h: 20 }, name, colors.muted, 14, "left");
    }
  }

  if (chart.type === "pie") {
    const values = chart.series[0]!.values.map((v) => Math.max(0, v));
    const total = values.reduce((sum, v) => sum + v, 0) || 1;
    const r = Math.min(shape.h, shape.w / 2) / 2 - 8;
    const cx = shape.x + r + 8;
    const cy = shape.y + shape.h / 2;
    const slice = (i: number) => (chart.highlight === null ? [colors.accent, ...colors.series, colors.quiet][i % 4]! : i === chart.highlight ? colors.accent : [colors.series[0]!, colors.series[1]!, colors.series[2]!, colors.quiet][i % 4]!);
    let angle = -Math.PI / 2;
    values.forEach((value, i) => {
      const sweep = (value / total) * Math.PI * 2;
      const [x1, y1] = [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
      angle += sweep;
      const [x2, y2] = [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
      const d = sweep >= Math.PI * 2 - 1e-6 ? `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0` : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z`;
      out.push({ kind: "path", d, fill: slice(i) });
    });
    const legendY = cy - (values.length * 40) / 2;
    chart.labels.forEach((name, i) => {
      const y = legendY + i * 40;
      out.push({ kind: "rect", x: cx + r + 64, y: y + 6, w: 14, h: 14, fill: slice(i), radius: 3 });
      label({ x: cx + r + 92, y, w: 360, h: 26 }, name, colors.ink, 18, "left");
      label({ x: cx + r + 92 + 360, y, w: 160, h: 26 }, `${formatValue(values[i]!)}${chart.unit ? ` ${chart.unit}` : ""}`, colors.muted, 18, "right");
    });
    return out;
  }

  const top = shape.y + 40;
  const baseY = shape.y + shape.h - 32;
  const totals = chart.labels.map((_, i) => chart.series.reduce((sum, s) => sum + Math.max(0, s.values[i] ?? 0), 0));
  const all = chart.type === "stacked" ? totals : chart.series.flatMap((s) => s.values);
  const max = Math.max(...all, 0);
  const min = Math.min(...all, 0);
  const span = max - min || 1;
  const y = (v: number) => baseY - ((v - min) / span) * (baseY - top);
  const step = shape.w / chart.labels.length;
  out.push(rule(shape.x, y(Math.max(min, 0)), shape.w, colors.rule));
  chart.labels.forEach((name, i) => label({ x: shape.x + step * i, y: baseY + 10, w: step, h: 20 }, name, colors.muted, 15));
  const seriesColor = (s: number, i: number) => (multi ? colors.series[s]! : chart.highlight === null ? colors.series[0]! : i === chart.highlight ? colors.accent : colors.quiet);

  if (chart.type === "line") {
    chart.series.forEach((series, s) => {
      const points = series.values.map((v, i): [number, number] => [shape.x + step * i + step / 2, y(v)]);
      out.push({ kind: "polyline", points, color: multi ? colors.series[s]! : colors.series[0]!, width: 3 });
      points.forEach(([px, py], i) => {
        const lit = !multi && chart.highlight === i;
        out.push({ kind: "circle", cx: px, cy: py, r: lit ? 8 : 5, fill: lit ? colors.accent : multi ? colors.series[s]! : colors.series[0]! });
        if (!multi) label({ x: px - 60, y: py - 34, w: 120, h: 20 }, formatValue(series.values[i]!), lit ? colors.accent : colors.ink, 15, "center", lit);
      });
    });
    return out;
  }

  if (chart.type === "stacked") {
    const bar = step * 0.56;
    chart.labels.forEach((_, i) => {
      let acc = 0;
      chart.series.forEach((series, s) => {
        const v = Math.max(0, series.values[i] ?? 0);
        out.push({ kind: "rect", x: shape.x + step * i + (step - bar) / 2, y: y(acc + v), w: bar, h: Math.max(0, y(acc) - y(acc + v)), fill: colors.series[s] ?? colors.quiet });
        acc += v;
      });
      label({ x: shape.x + step * i, y: y(totals[i]!) - 26, w: step, h: 20 }, formatValue(totals[i]!), colors.ink, 15);
    });
    return out;
  }

  // Grouped bars.
  const group = step * 0.64;
  const bar = group / chart.series.length;
  chart.labels.forEach((_, i) => {
    chart.series.forEach((series, s) => {
      const v = series.values[i] ?? 0;
      const x = shape.x + step * i + (step - group) / 2 + s * bar;
      const yTop = Math.min(y(v), y(0));
      out.push({ kind: "rect", x: x + 2, y: yTop, w: bar - 4, h: Math.max(1, Math.abs(y(v) - y(0))), fill: seriesColor(s, i) });
      label({ x: x - 8, y: yTop - 24, w: bar + 16, h: 18 }, formatValue(v), !multi && chart.highlight === i ? colors.accent : multi ? colors.muted : colors.ink, multi ? 13 : 15, "center", !multi && chart.highlight === i);
    });
  });
  return out;
}

// ==== measuring ================================================================================

/**
 * A conservative estimate of how much space text takes, used by tests to prove that the longest
 * text the schema allows fits every box. Widths are average glyph widths for Arial/DM Sans as a
 * share of the font size, with word wrapping (a word never splits unless it's longer than the line).
 */
const AVERAGE = 0.55;
const BOLD = 0.6;

export function lines(value: string, width: number, size: number, bold = false, tracking = 0) {
  const perChar = size * (bold ? BOLD : AVERAGE) + tracking;
  const fit = Math.max(1, Math.floor(width / perChar));
  let count = 0;
  for (const paragraph of value.split("\n")) {
    let line = 0;
    count += 1;
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line === 0) line = word.length;
      else if (line + 1 + word.length <= fit) line += 1 + word.length;
      else {
        count += 1;
        line = word.length;
      }
      while (line > fit) {
        count += 1;
        line -= fit;
      }
    }
  }
  return count;
}

/** The height a text shape needs, in px. */
export function neededHeight(shape: TextShape) {
  return lines(plainText(shape), shape.w, shape.size, shape.bold, Math.max(0, shape.tracking ?? 0)) * shape.size * shape.leading;
}

/** Text shapes that would overflow their box. */
export function overflowing(shapes: Shape[]) {
  return shapes.filter((shape): shape is TextShape => shape.kind === "text" && neededHeight(shape) > shape.h + 0.5);
}

// ==== HTML (previews, PDF, the meeting tile) ===================================================

const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function textHtml(shape: TextShape, font: string) {
  const justify = shape.valign === "middle" ? "center" : shape.valign === "bottom" ? "flex-end" : "flex-start";
  const runs = shape.runs.map((run) => `<span style="color:${run.color}">${esc(run.text).replace(/\n/g, "<br>")}</span>`).join("");
  return `<div style="position:absolute;left:${shape.x}px;top:${shape.y}px;width:${shape.w}px;height:${shape.h}px;display:flex;flex-direction:column;justify-content:${justify}"><div style="font-family:${font};font-size:${shape.size}px;line-height:${shape.leading};font-weight:${shape.bold ? 700 : 400};letter-spacing:${shape.tracking ?? 0}px;text-align:${shape.align ?? "left"}">${runs}</div></div>`;
}

function vectorSvg(shape: VectorShape): string {
  switch (shape.kind) {
    case "rect":
      return `<rect x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" rx="${shape.radius ?? 0}" fill="${shape.fill ?? "none"}"${shape.stroke ? ` stroke="${shape.stroke}" stroke-width="1.5"` : ""}/>`;
    case "line": {
      const head = shape.arrow ? `<path d="M ${shape.x2} ${shape.y2} l -10 -6 v 12 z" fill="${shape.color}"/>` : "";
      return `<line x1="${shape.x1}" y1="${shape.y1}" x2="${shape.x2 - (shape.arrow ? 8 : 0)}" y2="${shape.y2}" stroke="${shape.color}" stroke-width="${shape.width}"/>${head}`;
    }
    case "path":
      return `<path d="${shape.d}" fill="${shape.fill}"/>`;
    case "circle":
      return `<circle cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}" fill="${shape.fill}"/>`;
    case "polyline":
      return `<polyline points="${shape.points.map((pt) => pt.join(",")).join(" ")}" fill="none" stroke="${shape.color}" stroke-width="${shape.width}" stroke-linejoin="round" stroke-linecap="round"/>`;
    case "text":
      return "";
  }
}

/** A scene as a self-contained 1280×720 HTML fragment. */
export function sceneHtml(scene: Scene, font = "Arial, Helvetica, sans-serif") {
  const vectors: VectorShape[] = [];
  const texts: TextShape[] = [];
  for (const shape of scene.shapes) {
    if (shape.kind === "chart") {
      for (const part of chartShapes(shape)) (part.kind === "text" ? texts : vectors).push(part);
    } else if (shape.kind === "text") texts.push(shape);
    else vectors.push(shape);
  }
  return `<div style="position:relative;width:${CANVAS.width}px;height:${CANVAS.height}px;overflow:hidden;background:${scene.background}"><svg width="${CANVAS.width}" height="${CANVAS.height}" style="position:absolute;inset:0">${vectors.map(vectorSvg).join("")}</svg>${texts.map((shape) => textHtml(shape, font)).join("")}</div>`;
}
