import * as pptxModule from "pptxgenjs";
import { BULLET_INDENT, palette, sceneOf, type Deck, type Shape } from "@muse-clone/decks";

/**
 * A deck as a real PowerPoint file: every shape from the shared scene, editable text, native charts
 * and speaker notes. The page is 16:9 (13.333×7.5 in), which is the scene's 1280×720 at 96 px per
 * inch, so it matches the app exactly. Arial is on every machine and in Google Slides.
 */
// The package's types declare an ES default export but it isn't marked as an ES module, so under
// NodeNext the default import types as the whole module; its ES build does export the class.
const PptxGenJS = pptxModule.default as unknown as typeof pptxModule.default.default;
type Pptx = InstanceType<typeof PptxGenJS>;
type PptxSlide = ReturnType<Pptx["addSlide"]>;

const PX_PER_IN = 96;
const FONT = "Arial";
const inch = (px: number) => px / PX_PER_IN;
/** Font sizes in the scene are px; PowerPoint wants points. */
const pt = (px: number) => Math.round(px * 0.75 * 10) / 10;
const hex = (color: string) => color.replace("#", "").toUpperCase();
const box = (shape: Shape) => ({ x: inch(shape.x), y: inch(shape.y), w: inch(shape.w), h: inch(shape.h) });
const bulletCode = (bullet: string) => bullet.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0");

function draw(pptx: Pptx, slide: PptxSlide, shape: Shape) {
  switch (shape.kind) {
    case "rect":
      slide.addShape(shape.radius ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, {
        ...box(shape),
        fill: { color: hex(shape.fill) },
        line: { color: hex(shape.fill), width: 0 },
        ...(shape.radius ? { rectRadius: Math.min(1, shape.radius / (Math.min(shape.w, shape.h) / 2)) } : {}),
      });
      return;
    case "text":
      slide.addText(shape.text, {
        ...box(shape),
        fontFace: FONT,
        fontSize: pt(shape.size),
        bold: !!shape.bold,
        color: hex(shape.color),
        align: shape.align ?? "left",
        valign: shape.valign ?? "top",
        lineSpacingMultiple: shape.leading,
        margin: 0,
        fit: "none",
      });
      return;
    case "list":
      slide.addText(
        shape.items.map((item, i) => ({
          text: item,
          options: {
            bullet: { characterCode: bulletCode(shape.bullet), indent: pt(BULLET_INDENT) },
            breakLine: i < shape.items.length - 1,
            paraSpaceAfter: i < shape.items.length - 1 ? pt(shape.gap) : 0,
          },
        })),
        { ...box(shape), fontFace: FONT, fontSize: pt(shape.size), color: hex(shape.color), valign: "top", lineSpacingMultiple: shape.leading, margin: 0, fit: "none" },
      );
      return;
    case "chart": {
      const { chart } = shape;
      const type = chart.type === "pie" ? pptx.ChartType.pie : chart.type === "line" ? pptx.ChartType.line : pptx.ChartType.bar;
      const data = [{ name: chart.unit ?? "Value", labels: chart.points.map((p) => p.label), values: chart.points.map((p) => p.value) }];
      const axis = { fontFace: FONT, fontSize: 12, color: hex(shape.muted) };
      slide.addChart(type, data, {
        ...box(shape),
        chartColors: (chart.type === "pie" ? shape.colors : [shape.colors[0]!]).map(hex),
        showLegend: chart.type === "pie",
        legendPos: "r",
        legendFontFace: FONT,
        legendFontSize: 14,
        legendColor: hex(shape.ink),
        showValue: chart.type !== "line",
        showPercent: false,
        dataLabelColor: hex(chart.type === "pie" ? "#FFFFFF" : shape.ink),
        dataLabelFontFace: FONT,
        dataLabelFontSize: 13,
        dataLabelPosition: chart.type === "bar" ? "outEnd" : "bestFit",
        barDir: "col",
        barGapWidthPct: 60,
        lineSize: 3,
        lineDataSymbolSize: 8,
        catAxisLabelFontFace: axis.fontFace,
        catAxisLabelFontSize: axis.fontSize,
        catAxisLabelColor: axis.color,
        valAxisLabelFontFace: axis.fontFace,
        valAxisLabelFontSize: axis.fontSize,
        valAxisLabelColor: axis.color,
        valAxisHidden: chart.type === "bar",
        valGridLine: chart.type === "bar" ? { style: "none" } : { color: "E4E4E7", size: 1 },
        catGridLine: { style: "none" },
      });
      return;
    }
  }
}

/** The deck as .pptx bytes. Made on demand, never stored. */
export async function renderPptx(deck: Deck): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = deck.title;
  pptx.company = "Mates";
  pptx.author = "Mates";
  const total = deck.slides.length + (deck.sources.length ? 1 : 0);
  deck.slides.forEach((item, index) => {
    const scene = sceneOf(deck, item, index, total);
    const slide = pptx.addSlide();
    slide.background = { color: hex(scene.background) };
    for (const shape of scene.shapes) draw(pptx, slide, shape);
    if (item.notes) slide.addNotes(item.notes);
  });
  if (deck.sources.length) {
    // The links behind the figures, as the last slide.
    const p = palette(deck.theme);
    const slide = pptx.addSlide();
    slide.background = { color: hex(p.paper) };
    slide.addShape(pptx.ShapeType.rect, { x: inch(80), y: inch(44), w: inch(64), h: inch(6), fill: { color: hex(p.accent) }, line: { color: hex(p.accent), width: 0 } });
    slide.addText("Sources", { x: inch(80), y: inch(64), w: inch(1120), h: inch(60), fontFace: FONT, fontSize: pt(40), bold: true, color: hex(p.ink), margin: 0 });
    slide.addText(
      deck.sources.map((source, i) => ({
        text: source.url ? `${source.title}: ${source.url}` : source.title,
        options: { breakLine: i < deck.sources.length - 1, paraSpaceAfter: 6, ...(source.url ? { hyperlink: { url: source.url } } : {}) },
      })),
      { x: inch(80), y: inch(160), w: inch(1120), h: inch(480), fontFace: FONT, fontSize: pt(18), color: hex(p.ink), valign: "top", margin: 0 },
    );
  }
  return (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
}
