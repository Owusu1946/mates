import { z } from "zod";

/**
 * Mates' pages. A mate fills in a validated page document (sections of blocks); code we own draws
 * it (./render), so a page always looks right and the model's tokens go only on content. Optional
 * fields are nullable rather than absent, so the same shapes work as strict JSON schemas for the
 * model, as with decks.
 */

export const LIMITS = {
  title: 90,
  subtitle: 180,
  emoji: 8,
  sections: [1, 12],
  blocks: 60,
  sectionBlocks: [1, 10],
  heading: 80,
  text: 1_500,
  item: 220,
  items: [1, 24],
  callout: 500,
  quote: 320,
  attribution: 80,
  columns: [2, 8],
  rows: [1, 40],
  cell: 140,
  metrics: [2, 4],
  metricValue: 18,
  metricLabel: 48,
  metricNote: 48,
  chartLabel: 18,
  chartLabels: [2, 12],
  seriesName: 24,
  series: [1, 3],
  unit: 12,
  steps: [2, 14],
  when: 40,
  stepTitle: 90,
  stepText: 320,
  cards: [2, 9],
  cardTitle: 80,
  cardBody: 320,
  tag: 24,
  sources: 24,
  sourceTitle: 140,
} as const;

const text = (max: number) => z.string().trim().min(1).max(max);
const maybe = (max: number) => text(max).nullable();
const list = <T extends z.ZodType>(item: T, [min, max]: readonly [number, number]) => z.array(item).min(min).max(max);
const id = z.string().min(1).max(8);
/** Which sources back a block's figures, by id. */
const cites = z.array(z.string().max(8)).max(4);
const url = z.string().url().max(500).nullable();

export const PAGE_KINDS = ["trip", "event", "guide", "comparison", "tracker", "list", "status", "other"] as const;
export type PageKind = (typeof PAGE_KINDS)[number];
export const THEMES = ["paper", "ink", "warm", "ledger"] as const;
export type ThemeName = (typeof THEMES)[number];

/** What a block can be, without its id: the shape the model fills in. */
export const blockContent = {
  text: z.strictObject({ type: z.literal("text"), text: text(LIMITS.text), cites }),
  list: z.strictObject({ type: z.literal("list"), ordered: z.boolean(), items: list(text(LIMITS.item), LIMITS.items) }),
  checklist: z.strictObject({ type: z.literal("checklist"), items: list(z.strictObject({ text: text(LIMITS.item), done: z.boolean() }), LIMITS.items) }),
  callout: z.strictObject({ type: z.literal("callout"), tone: z.enum(["info", "tip", "warning"]), title: maybe(LIMITS.heading), text: text(LIMITS.callout) }),
  quote: z.strictObject({ type: z.literal("quote"), text: text(LIMITS.quote), attribution: maybe(LIMITS.attribution) }),
  divider: z.strictObject({ type: z.literal("divider") }),
  table: z.strictObject({
    type: z.literal("table"),
    caption: maybe(LIMITS.heading),
    columns: list(text(LIMITS.cell), LIMITS.columns),
    rows: list(z.array(z.string().max(LIMITS.cell)), LIMITS.rows),
    /** A last row of totals, drawn heavier. */
    totals: z.boolean(),
    cites,
  }),
  metrics: z.strictObject({
    type: z.literal("metrics"),
    items: list(z.strictObject({ value: text(LIMITS.metricValue), label: text(LIMITS.metricLabel), note: maybe(LIMITS.metricNote) }), LIMITS.metrics),
    cites,
  }),
  chart: z.strictObject({
    type: z.literal("chart"),
    title: maybe(LIMITS.heading),
    kind: z.enum(["bar", "line", "donut"]),
    unit: maybe(LIMITS.unit),
    labels: list(text(LIMITS.chartLabel), LIMITS.chartLabels),
    series: list(z.strictObject({ name: text(LIMITS.seriesName), values: z.array(z.number().finite()) }), LIMITS.series),
    /** The label to emphasise with the accent; null for none. */
    highlight: z.number().int().min(0).nullable(),
    cites,
  }),
  timeline: z.strictObject({
    type: z.literal("timeline"),
    steps: list(z.strictObject({ when: text(LIMITS.when), title: text(LIMITS.stepTitle), text: maybe(LIMITS.stepText) }), LIMITS.steps),
  }),
  cards: z.strictObject({
    type: z.literal("cards"),
    items: list(z.strictObject({ title: text(LIMITS.cardTitle), body: text(LIMITS.cardBody), tag: maybe(LIMITS.tag), url }), LIMITS.cards),
    cites,
  }),
} as const;

export type BlockType = keyof typeof blockContent;
export const BLOCK_TYPES = Object.keys(blockContent) as BlockType[];
type ContentOf<T extends BlockType> = z.infer<(typeof blockContent)[T]>;
export type BlockContent = { [T in BlockType]: ContentOf<T> }[BlockType];
export type Block = BlockContent & { id: string };
export type BlockOf<T extends BlockType> = ContentOf<T> & { id: string };

export const blockContentSchema = z.discriminatedUnion("type", Object.values(blockContent) as unknown as [z.ZodObject, ...z.ZodObject[]]);
export const blockSchema = z.discriminatedUnion(
  "type",
  Object.values(blockContent).map((schema) => schema.extend({ id })) as unknown as [z.ZodObject, ...z.ZodObject[]],
);

export const sourceSchema = z.strictObject({ id: z.string().max(8), title: text(LIMITS.sourceTitle), url });
export type Source = z.infer<typeof sourceSchema>;

export const sectionSchema = z.strictObject({ id, heading: text(LIMITS.heading), blocks: list(blockSchema, LIMITS.sectionBlocks) });
export type Section = { id: string; heading: string; blocks: Block[] };

export const pageSchema = z.strictObject({
  title: text(LIMITS.title),
  subtitle: maybe(LIMITS.subtitle),
  emoji: maybe(LIMITS.emoji),
  theme: z.enum(THEMES),
  sections: list(sectionSchema, LIMITS.sections),
  sources: z.array(sourceSchema).max(LIMITS.sources),
});
export type PageDoc = { title: string; subtitle: string | null; emoji: string | null; theme: ThemeName; sections: Section[]; sources: Source[] };

/** Problems the schema can't express: citations to unknown sources, chart shapes, table widths, size. */
export function pageProblems(doc: PageDoc): string[] {
  const problems: string[] = [];
  const parsed = pageSchema.safeParse(doc);
  if (!parsed.success) problems.push(...parsed.error.issues.slice(0, 8).map((issue) => `${issue.path.join(".")}: ${issue.message}`));
  const sources = new Set(doc.sources.map((s) => s.id));
  const ids = new Set<string>();
  let count = 0;
  for (const section of doc.sections ?? []) {
    if (ids.has(section.id)) problems.push(`section ${section.id}: duplicate id`);
    ids.add(section.id);
    for (const block of section.blocks ?? []) {
      count++;
      if (ids.has(block.id)) problems.push(`block ${block.id}: duplicate id`);
      ids.add(block.id);
      problems.push(...blockProblems(block, sources).map((p) => `block ${block.id}: ${p}`));
    }
  }
  if (count > LIMITS.blocks) problems.push(`the page has ${count} blocks; keep it to ${LIMITS.blocks}`);
  return problems;
}

/** One block's problems beyond its schema; `sources` is the page's source ids. */
export function blockProblems(block: BlockContent, sources: Set<string>): string[] {
  const problems: string[] = [];
  if ("cites" in block) for (const cite of block.cites) if (!sources.has(cite)) problems.push(`cites unknown source "${cite}"`);
  if (block.type === "table") {
    block.rows.forEach((row, i) => { if (row.length !== block.columns.length) problems.push(`row ${i + 1} has ${row.length} cells for ${block.columns.length} columns`); });
  }
  if (block.type === "chart") {
    block.series.forEach((s) => { if (s.values.length !== block.labels.length) problems.push(`series "${s.name}" has ${s.values.length} values for ${block.labels.length} labels`); });
    if (block.kind === "donut" && block.series.length > 1) problems.push("a donut chart has one series");
    if (block.kind === "donut" && block.series[0]?.values.some((v) => v < 0)) problems.push("a donut chart can't have negative values");
    if (block.highlight !== null && block.highlight >= block.labels.length) problems.push("highlight is past the last label");
  }
  return problems;
}

/** A one-line description of a block, for the outline a model edits from (never its full content). */
export function blockSummary(block: Block): string {
  const cut = (value: string, n = 60) => (value.length > n ? `${value.slice(0, n - 1)}…` : value);
  switch (block.type) {
    case "text": return `text: ${cut(block.text)}`;
    case "list": return `list (${block.items.length}): ${cut(block.items.join("; "))}`;
    case "checklist": return `checklist (${block.items.length}, ${block.items.filter((i) => i.done).length} done): ${cut(block.items.map((i) => i.text).join("; "))}`;
    case "callout": return `${block.tone} callout: ${cut(block.title ?? block.text)}`;
    case "quote": return `quote: ${cut(block.text)}`;
    case "divider": return "divider";
    case "table": return `table ${block.columns.length}×${block.rows.length}: ${cut(block.caption ?? block.columns.join(", "))}`;
    case "metrics": return `metrics: ${cut(block.items.map((m) => `${m.label} ${m.value}`).join(", "))}`;
    case "chart": return `${block.kind} chart: ${cut(block.title ?? block.labels.join(", "))}`;
    case "timeline": return `timeline (${block.steps.length}): ${cut(block.steps.map((s) => `${s.when} ${s.title}`).join("; "))}`;
    case "cards": return `cards (${block.items.length}): ${cut(block.items.map((c) => c.title).join(", "))}`;
  }
}

/** The page as an outline: headings and one line per block, with ids, for edits. */
export function pageOutline(doc: PageDoc): string {
  return doc.sections.map((s) => [`[${s.id}] ## ${s.heading}`, ...s.blocks.map((b) => `  [${b.id}] ${blockSummary(b)}`)].join("\n")).join("\n");
}

/** Every bit of text a reader sees, for checks like personal data. */
export function pageText(doc: PageDoc): string[] {
  const out: string[] = [doc.title, doc.subtitle ?? ""];
  for (const section of doc.sections) {
    out.push(section.heading);
    for (const block of section.blocks) {
      switch (block.type) {
        case "text": out.push(block.text); break;
        case "list": out.push(...block.items); break;
        case "checklist": out.push(...block.items.map((i) => i.text)); break;
        case "callout": out.push(block.title ?? "", block.text); break;
        case "quote": out.push(block.text, block.attribution ?? ""); break;
        case "table": out.push(block.caption ?? "", ...block.columns, ...block.rows.flat()); break;
        case "metrics": out.push(...block.items.flatMap((m) => [m.value, m.label, m.note ?? ""])); break;
        case "chart": out.push(block.title ?? "", ...block.labels); break;
        case "timeline": out.push(...block.steps.flatMap((s) => [s.when, s.title, s.text ?? ""])); break;
        case "cards": out.push(...block.items.flatMap((c) => [c.title, c.body, c.tag ?? ""])); break;
        case "divider": break;
      }
    }
  }
  return out.filter(Boolean);
}
