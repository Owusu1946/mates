import { z } from "zod";

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
