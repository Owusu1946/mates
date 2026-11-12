import { z } from "zod";

// ==== schema =================================================================================

/**
 * The deck document a mate fills in. Code we own draws it (in the app and in PowerPoint), so the
 * model never writes layout code. Limits are hard: text over them goes back to the model to tighten,
 * it is never shrunk or cut. Optional fields are nullable rather than absent, so the same shapes work
 * as strict JSON schemas for the model.
 */

export const LIMITS = {
  title: 60,
  subtitle: 120,
  sectionTitle: 50,
  kicker: 40,
  bullet: 90,
  bullets: [2, 5],
  columnHeading: 40,
  columnBody: 220,
  value: 12,
  valueLabel: 80,
  valueContext: 160,
  pointLabel: 16,
  points: [2, 8],
  unit: 12,
  takeaway: 100,
  quote: 200,
  attribution: 60,
  stepLabel: 18,
  stepText: 70,
  steps: [3, 5],
  comparisonHeading: 28,
  comparisonPoint: 44,
  comparisonPoints: [1, 4],
  columns: [2, 3],
  closingSubtitle: 140,
  contact: 80,
  notes: 600,
  slides: [3, 20],
  deckTitle: 80,
  sources: 12,
} as const;

const text = (max: number) => z.string().trim().min(1).max(max);
const maybe = (max: number) => text(max).nullable();
const list = <T extends z.ZodType>(item: T, [min, max]: readonly [number, number]) => z.array(item).min(min).max(max);

/** Which sources back a figure, or that the user gave it; checked by `deckProblems`. */
const evidence = {
  sourceIds: z.array(z.string().max(8)).max(4),
  fromUser: z.boolean(),
};

export const slideContent = {
  title: z.strictObject({ layout: z.literal("title"), title: text(LIMITS.title), subtitle: maybe(LIMITS.subtitle) }),
  section: z.strictObject({ layout: z.literal("section"), title: text(LIMITS.sectionTitle), kicker: maybe(LIMITS.kicker) }),
  bullets: z.strictObject({ layout: z.literal("bullets"), title: text(LIMITS.title), bullets: list(text(LIMITS.bullet), LIMITS.bullets) }),
  "two-column": z.strictObject({
    layout: z.literal("two-column"),
    title: text(LIMITS.title),
    left: z.strictObject({ heading: text(LIMITS.columnHeading), body: text(LIMITS.columnBody) }),
    right: z.strictObject({ heading: text(LIMITS.columnHeading), body: text(LIMITS.columnBody) }),
  }),
  "big-number": z.strictObject({
    layout: z.literal("big-number"),
    title: text(LIMITS.title),
    value: text(LIMITS.value),
    label: text(LIMITS.valueLabel),
    context: maybe(LIMITS.valueContext),
    ...evidence,
  }),
  chart: z.strictObject({
    layout: z.literal("chart"),
    title: text(LIMITS.title),
    chart: z.strictObject({
      type: z.enum(["bar", "line", "pie"]),
      unit: maybe(LIMITS.unit),
      points: list(z.strictObject({ label: text(LIMITS.pointLabel), value: z.number().finite() }), LIMITS.points),
    }),
    takeaway: maybe(LIMITS.takeaway),
    ...evidence,
  }),
  quote: z.strictObject({ layout: z.literal("quote"), quote: text(LIMITS.quote), attribution: maybe(LIMITS.attribution) }),
  timeline: z.strictObject({
    layout: z.literal("timeline"),
    title: text(LIMITS.title),
    steps: list(z.strictObject({ label: text(LIMITS.stepLabel), text: text(LIMITS.stepText) }), LIMITS.steps),
  }),
  comparison: z.strictObject({
    layout: z.literal("comparison"),
    title: text(LIMITS.title),
    columns: list(
      z.strictObject({ heading: text(LIMITS.comparisonHeading), points: list(text(LIMITS.comparisonPoint), LIMITS.comparisonPoints) }),
      LIMITS.columns,
    ),
  }),
  closing: z.strictObject({ layout: z.literal("closing"), title: text(LIMITS.title), subtitle: maybe(LIMITS.closingSubtitle), contact: maybe(LIMITS.contact) }),
} as const;

export type Layout = keyof typeof slideContent;
export const LAYOUTS = Object.keys(slideContent) as Layout[];

/** What each layout is for, told to the model when it plans the deck. */
export const LAYOUT_GUIDE: Record<Layout, string> = {
  title: "the opening slide: deck title and a one-line subtitle",
  section: "a divider that starts a new part of the deck",
  bullets: "2-5 short points under a headline",
  "two-column": "two ideas side by side, each a heading and a short paragraph",
  "big-number": "one striking figure with what it means (needs a source or the user's own number)",
  chart: "a bar, line or pie chart of 2-8 real data points (needs a source or the user's own data)",
  quote: "a quotation worth the whole slide, with who said it",
  timeline: "3-5 steps or milestones in order",
  comparison: "2-3 options compared, a few points each",
  closing: "the last slide: the ask, next step or thanks, with contact details if given",
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

export const sourceSchema = z.strictObject({ id: z.string().max(8), title: text(120), url: z.string().url().nullable() });
export type Source = z.infer<typeof sourceSchema>;

export const themeSchema = z.strictObject({
  mode: z.enum(["light", "dark"]),
  /** The mate's three-stop gradient (light, mid, deep); every colour on a slide comes from it. */
  gradient: z.tuple([z.string(), z.string(), z.string()]),
});
export type ThemeInput = z.infer<typeof themeSchema>;

export const deckSchema = z.strictObject({
  title: text(LIMITS.deckTitle),
  theme: themeSchema,
  slides: z.array(slideSchema).min(1).max(LIMITS.slides[1]),
  sources: z.array(sourceSchema).max(LIMITS.sources),
});
export type Deck = { title: string; theme: ThemeInput; slides: Slide[]; sources: Source[] };

/** Plain-language problems with one slide, for the model to fix. Empty when the slide is fine. */
export function slideProblems(slide: unknown, sources: Source[]): string[] {
  const parsed = slideSchema.safeParse(slide);
  if (!parsed.success)
    return parsed.error.issues.map((issue) => `${issue.path.join(".") || "slide"}: ${issue.message}`);
  const value = parsed.data as Slide;
  if (value.layout === "big-number" || value.layout === "chart") {
    const known = new Set(sources.map((source) => source.id));
    const cited = value.sourceIds.filter((id) => known.has(id));
    if (!value.fromUser && cited.length === 0)
      return ["This slide shows figures but cites no source and isn't the user's own data. Cite a source id, or use a layout without figures."];
  }
  return [];
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

// ==== theme ==================================================================================

/**
 * Slide colours, all derived from the mate's gradient and the app's neutrals, so a deck looks like
 * the mate that made it and no colour is invented.
 */
export type Palette = {
  paper: string;
  ink: string;
  muted: string;
  accent: string;
  /** Text and marks drawn on top of `accent`. */
  onAccent: string;
  /** Cards and panels: a whisper of the accent on paper. */
  surface: string;
  /** Series colours for charts, accent first. */
  series: string[];
};

const LIGHT = { paper: "#FFFFFF", ink: "#0A0A0A", muted: "#52525B" };
const DARK = { paper: "#0A0A0A", ink: "#FAFAFA", muted: "#A1A1AA" };

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

/** Relative luminance (WCAG), for picking readable text on a colour. */
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

export function palette(theme: ThemeInput): Palette {
  const [light, mid, deep] = theme.gradient;
  const neutrals = theme.mode === "dark" ? DARK : LIGHT;
  // The accent must read as text on paper: the mid stop usually does; otherwise the stop that does.
  const candidates = theme.mode === "dark" ? [mid, light] : [mid, deep];
  const accent = candidates.find((c) => contrast(c, neutrals.paper) >= 3) ?? (theme.mode === "dark" ? light : deep);
  const onAccent = contrast(LIGHT.paper, accent) >= contrast(LIGHT.ink, accent) ? LIGHT.paper : LIGHT.ink;
  const surface = mix(accent, neutrals.paper, theme.mode === "dark" ? 0.16 : 0.08);
  const series = [accent, theme.mode === "dark" ? light : deep, mix(accent, neutrals.paper, 0.55), mix(deep, neutrals.paper, 0.7), mix(light, neutrals.ink, 0.7), mix(accent, neutrals.ink, 0.6), mix(mid, neutrals.paper, 0.3), neutrals.muted];
  return { ...neutrals, accent, onAccent, surface, series };
}

// ==== scene ==================================================================================

/**
 * Every slide as a list of simple shapes on a 1280×720 canvas. The app and the PowerPoint export
 * both draw this list, so a slide looks the same everywhere and the layout lives in one place.
 * PowerPoint's 16:9 page is 13.333×7.5 in, exactly 1280×720 at 96 px per inch.
 */
export const CANVAS = { width: 1280, height: 720 } as const;
const M = 80; // side margin
const W = CANVAS.width - 2 * M;

export type Align = "left" | "center" | "right";
export type VAlign = "top" | "middle" | "bottom";
type Box = { x: number; y: number; w: number; h: number };

export type TextShape = Box & {
  kind: "text";
  text: string;
  size: number;
  bold?: boolean;
  color: string;
  align?: Align;
  valign?: VAlign;
  /** Line height as a multiple of the font size. */
  leading: number;
};
export type ListShape = Box & {
  kind: "list";
  items: string[];
  size: number;
  color: string;
  bullet: string;
  leading: number;
  /** Space between items, in px. */
  gap: number;
};
export type RectShape = Box & { kind: "rect"; fill: string; radius?: number };
export type ChartShape = Box & {
  kind: "chart";
  chart: SlideOf<"chart">["chart"];
  colors: string[];
  ink: string;
  muted: string;
};
export type Shape = TextShape | ListShape | RectShape | ChartShape;
export type Scene = { background: string; shapes: Shape[] };

/** Indent of list text after its bullet, in px. */
export const BULLET_INDENT = 36;

const header = (title: string, p: Palette): Shape[] => [
  { kind: "rect", x: M, y: 44, w: 64, h: 6, fill: p.accent },
  { kind: "text", x: M, y: 64, w: W, h: 96, text: title, size: 40, bold: true, color: p.ink, leading: 1.15, valign: "top" },
];

const footer = (index: number, total: number, p: Palette, sourceLine: string | null): Shape[] => [
  ...(sourceLine ? [{ kind: "text", x: M, y: 664, w: W - 120, h: 24, text: sourceLine, size: 14, color: p.muted, leading: 1.2 } as const] : []),
  { kind: "text", x: CANVAS.width - M - 100, y: 664, w: 100, h: 24, text: `${index + 1} / ${total}`, size: 14, color: p.muted, align: "right", leading: 1.2 },
];

function sourceLine(slide: Slide, sources: Source[]) {
  if (slide.layout !== "big-number" && slide.layout !== "chart") return null;
  if (slide.fromUser && slide.sourceIds.length === 0) return null;
  const names = slide.sourceIds.map((id) => sources.find((s) => s.id === id)?.title).filter(Boolean);
  return names.length ? `Source: ${names.join("; ")}` : null;
}

function body(slide: Slide, p: Palette): Shape[] {
  switch (slide.layout) {
    case "title":
      return [
        { kind: "rect", x: M, y: 214, w: 96, h: 8, fill: p.accent },
        { kind: "text", x: M, y: 246, w: W, h: 150, text: slide.title, size: 60, bold: true, color: p.ink, leading: 1.12, valign: "top" },
        ...(slide.subtitle ? [{ kind: "text", x: M, y: 420, w: 1000, h: 100, text: slide.subtitle, size: 26, color: p.muted, leading: 1.3, valign: "top" } as const] : []),
      ];
    case "section":
      return [
        ...(slide.kicker ? [{ kind: "text", x: M, y: 252, w: W, h: 36, text: slide.kicker.toUpperCase(), size: 22, bold: true, color: p.onAccent, leading: 1.2 } as const] : []),
        { kind: "text", x: M, y: 300, w: W, h: 140, text: slide.title, size: 54, bold: true, color: p.onAccent, leading: 1.12, valign: "top" },
      ];
    case "bullets":
      return [
        ...header(slide.title, p),
        { kind: "list", x: M, y: 184, w: W, h: 460, items: slide.bullets, size: 28, color: p.ink, bullet: "•", leading: 1.3, gap: 18 },
      ];
    case "two-column": {
      const card = (x: number, column: SlideOf<"two-column">["left"]): Shape[] => [
        { kind: "rect", x, y: 184, w: 540, h: 456, fill: p.surface, radius: 16 },
        { kind: "rect", x: x + 32, y: 216, w: 40, h: 5, fill: p.accent },
        { kind: "text", x: x + 32, y: 236, w: 476, h: 76, text: column.heading, size: 28, bold: true, color: p.ink, leading: 1.2, valign: "top" },
        { kind: "text", x: x + 32, y: 324, w: 476, h: 290, text: column.body, size: 22, color: p.ink, leading: 1.4, valign: "top" },
      ];
      return [...header(slide.title, p), ...card(M, slide.left), ...card(M + 580, slide.right)];
    }
    case "big-number":
      return [
        ...header(slide.title, p),
        { kind: "text", x: M, y: 196, w: W, h: 170, text: slide.value, size: 140, bold: true, color: p.accent, leading: 1.05, valign: "top" },
        { kind: "text", x: M, y: 384, w: 1000, h: 90, text: slide.label, size: 32, bold: true, color: p.ink, leading: 1.25, valign: "top" },
        ...(slide.context ? [{ kind: "text", x: M, y: 490, w: 1000, h: 110, text: slide.context, size: 22, color: p.muted, leading: 1.4, valign: "top" } as const] : []),
      ];
    case "chart":
      return [
        ...header(slide.title, p),
        { kind: "chart", x: M, y: 184, w: W, h: slide.takeaway ? 400 : 460, chart: slide.chart, colors: p.series, ink: p.ink, muted: p.muted },
        ...(slide.takeaway ? [{ kind: "text", x: M, y: 596, w: W, h: 60, text: slide.takeaway, size: 24, bold: true, color: p.accent, leading: 1.2, valign: "top" } as const] : []),
      ];
    case "quote":
      return [
        { kind: "text", x: 120, y: 60, w: 160, h: 160, text: "“", size: 160, bold: true, color: p.accent, leading: 1 },
        { kind: "text", x: 140, y: 220, w: 1000, h: 300, text: slide.quote, size: 40, color: p.ink, leading: 1.3, valign: "top" },
        ...(slide.attribution ? [{ kind: "text", x: 140, y: 540, w: 1000, h: 40, text: `— ${slide.attribution}`, size: 24, color: p.muted, leading: 1.2 } as const] : []),
      ];
    case "timeline": {
      const n = slide.steps.length;
      const gap = 24;
      const w = (W - gap * (n - 1)) / n;
      return [
        ...header(slide.title, p),
        { kind: "rect", x: M, y: 268, w: W, h: 4, fill: p.surface },
        ...slide.steps.flatMap((step, i): Shape[] => {
          const x = M + i * (w + gap);
          return [
            { kind: "rect", x, y: 256, w: 28, h: 28, fill: p.accent, radius: 14 },
            { kind: "text", x, y: 304, w, h: 62, text: step.label, size: 24, bold: true, color: p.ink, leading: 1.2, valign: "top" },
            { kind: "text", x, y: 376, w, h: 200, text: step.text, size: 20, color: p.muted, leading: 1.4, valign: "top" },
          ];
        }),
      ];
    }
    case "comparison": {
      const n = slide.columns.length;
      const gap = 24;
      const w = (W - gap * (n - 1)) / n;
      return [
        ...header(slide.title, p),
        ...slide.columns.flatMap((column, i): Shape[] => {
          const x = M + i * (w + gap);
          return [
            { kind: "rect", x, y: 184, w, h: 456, fill: p.surface, radius: 16 },
            { kind: "text", x: x + 24, y: 208, w: w - 48, h: 70, text: column.heading, size: 26, bold: true, color: p.accent, leading: 1.2, valign: "top" },
            { kind: "list", x: x + 24, y: 292, w: w - 48, h: 330, items: column.points, size: 20, color: p.ink, bullet: "–", leading: 1.4, gap: 12 },
          ];
        }),
      ];
    }
    case "closing":
      return [
        { kind: "text", x: M, y: 230, w: W, h: 140, text: slide.title, size: 56, bold: true, color: p.ink, align: "center", leading: 1.12, valign: "middle" },
        ...(slide.subtitle ? [{ kind: "text", x: M, y: 390, w: W, h: 76, text: slide.subtitle, size: 26, color: p.muted, align: "center", leading: 1.3, valign: "top" } as const] : []),
        ...(slide.contact ? [{ kind: "text", x: M, y: 500, w: W, h: 36, text: slide.contact, size: 22, bold: true, color: p.accent, align: "center", leading: 1.2 } as const] : []),
      ];
  }
}

/** One slide of a deck as shapes, with its background. */
export function sceneOf(deck: Pick<Deck, "theme" | "sources">, slide: Slide, index: number, total: number): Scene {
  const p = palette(deck.theme);
  const background = slide.layout === "section" ? p.accent : p.paper;
  const chrome = slide.layout === "title" || slide.layout === "section" ? [] : footer(index, total, p, sourceLine(slide, deck.sources));
  return { background, shapes: [...body(slide, p), ...chrome] };
}

// ==== fit ====================================================================================

/**
 * A conservative estimate of how much space text takes, used by tests to prove that the longest
 * text the schema allows fits every box. Widths are average glyph widths for Arial/DM Sans as a
 * share of the font size, rounded up, with word wrapping (a word never splits unless it's longer
 * than the line).
 */
const AVERAGE = 0.55;
const BOLD = 0.6;

export function lines(text: string, width: number, size: number, bold = false) {
  const perChar = size * (bold ? BOLD : AVERAGE);
  const fit = Math.max(1, Math.floor(width / perChar));
  let count = 0;
  for (const paragraph of text.split("\n")) {
    let line = 0;
    count += 1;
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const length = word.length;
      if (line === 0) line = length;
      else if (line + 1 + length <= fit) line += 1 + length;
      else {
        count += 1;
        line = length;
      }
      while (line > fit) {
        count += 1;
        line -= fit;
      }
    }
  }
  return count;
}

/** The height a text or list shape needs, in px. */
export function neededHeight(shape: Shape) {
  if (shape.kind === "text") return lines(shape.text, shape.w, shape.size, shape.bold) * shape.size * shape.leading;
  if (shape.kind === "list") {
    const height = shape.items.reduce((sum, item) => sum + lines(item, shape.w - BULLET_INDENT, shape.size) * shape.size * shape.leading, 0);
    return height + shape.gap * Math.max(0, shape.items.length - 1);
  }
  return 0;
}

/** Shapes whose text would overflow their box, for tests and for a last check before rendering. */
export function overflowing(shapes: Shape[]) {
  return shapes.filter((shape) => (shape.kind === "text" || shape.kind === "list") && neededHeight(shape) > shape.h + 0.5);
}
