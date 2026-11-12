import type { Deck, Slide, SlideOf, Source } from "./schema";
import { palette, type Palette } from "./theme";

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
