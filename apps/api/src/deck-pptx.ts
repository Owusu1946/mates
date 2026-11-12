import * as pptxModule from "pptxgenjs";
import { CANVAS, palette, sceneOf, type ChartShape, type Deck, type Shape } from "@muse-clone/decks";

/**
 * A deck as a real PowerPoint file: every shape from the shared scene, editable text, native charts
 * and speaker notes. The page is 16:9 (13.333×7.5 in), which is the scene's 1280×720 at 96 px per
 * inch, so it matches the app exactly. Arial is on every machine and in Google Slides.
 */

// The package's types declare an ES default export but it isn't marked as an ES module, so under
// NodeNext the default import types as the whole module (bundler resolution, as in the app's
// typecheck, sees the class). Its ES build does export the class, so this resolves to it either way.
type Constructor<T> = T extends { default: infer D } ? (D extends new () => unknown ? D : T) : T;
const PptxGenJS = pptxModule.default as unknown as Constructor<typeof pptxModule.default>;
type Pptx = InstanceType<typeof PptxGenJS>;
type PptxSlide = ReturnType<Pptx["addSlide"]>;

const PX_PER_IN = 96;
const FONT = "Arial";
const inch = (px: number) => px / PX_PER_IN;
/** Sizes in the scene are px; PowerPoint wants points. */
const pt = (px: number) => Math.round(px * 0.75 * 10) / 10;
const hex = (color: string) => color.replace("#", "").toUpperCase();

function draw(pptx: Pptx, slide: PptxSlide, shape: Shape) {
  switch (shape.kind) {
    case "rect":
      slide.addShape(shape.radius ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, {
        x: inch(shape.x),
        y: inch(shape.y),
        w: inch(shape.w),
        h: inch(shape.h),
        fill: shape.fill ? { color: hex(shape.fill) } : { type: "none" },
        line: shape.stroke ? { color: hex(shape.stroke), width: 1 } : { type: "none" },
        ...(shape.radius ? { rectRadius: Math.min(1, shape.radius / (Math.min(shape.w, shape.h) / 2)) } : {}),
      });
      return;
    case "line":
      slide.addShape(pptx.ShapeType.line, {
        x: inch(Math.min(shape.x1, shape.x2)),
        y: inch(Math.min(shape.y1, shape.y2)),
        w: inch(Math.abs(shape.x2 - shape.x1)),
        h: inch(Math.abs(shape.y2 - shape.y1)),
        line: { color: hex(shape.color), width: shape.width * 0.75, ...(shape.arrow ? { endArrowType: "triangle" as const } : {}) },
      });
      return;
    case "text":
      slide.addText(
        shape.runs.map((run, i) => ({
          // A run that starts with a line break begins a new paragraph.
          text: run.text.replace(/^\n/, ""),
          options: { color: hex(run.color), breakLine: i < shape.runs.length - 1 && shape.runs[i + 1]!.text.startsWith("\n") },
        })),
        {
          x: inch(shape.x),
          y: inch(shape.y),
          w: inch(shape.w),
          h: inch(shape.h),
          fontFace: FONT,
          fontSize: pt(shape.size),
          bold: !!shape.bold,
          align: shape.align ?? "left",
          valign: shape.valign ?? "top",
          lineSpacingMultiple: shape.leading,
          charSpacing: shape.tracking ? pt(shape.tracking) : 0,
          margin: 0,
          fit: "none",
        },
      );
      return;
    case "chart":
      drawChart(pptx, slide, shape);
      return;
  }
}

/** A native, editable chart styled like the app's: quiet axes, direct labels, one accent. */
function drawChart(pptx: Pptx, slide: PptxSlide, shape: ChartShape) {
  const { chart, colors } = shape;
  const box = { x: inch(shape.x), y: inch(shape.y), w: inch(shape.w), h: inch(shape.h) };
  const axes = {
    catAxisLabelFontFace: FONT,
    catAxisLabelFontSize: 12,
    catAxisLabelColor: hex(colors.muted),
    catAxisLineShow: true,
    catAxisLineColor: hex(colors.rule),
    valAxisHidden: true,
    valGridLine: { style: "none" as const },
    catGridLine: { style: "none" as const },
    dataLabelFontFace: FONT,
    dataLabelFontSize: 12,
    dataLabelColor: hex(colors.ink),
    // Zero values (the gaps in a highlighted bar chart) get no label.
    dataLabelFormatCode: "#,##0.##;-#,##0.##;;",
    showLegend: chart.series.length > 1,
    legendPos: "t" as const,
    legendFontFace: FONT,
    legendFontSize: 12,
    legendColor: hex(colors.muted),
  };

  if (chart.type === "pie") {
    const slices = chart.labels.map((_, i) => (chart.highlight === null ? [colors.accent, ...colors.series, colors.quiet][i % 4]! : i === chart.highlight ? colors.accent : [...colors.series, colors.quiet][i % 4]!));
    slide.addChart(pptx.ChartType.pie, [{ name: chart.series[0]!.name, labels: chart.labels, values: chart.series[0]!.values }], {
      ...box,
      chartColors: slices.map(hex),
      showLegend: true,
      legendPos: "r",
      legendFontFace: FONT,
      legendFontSize: 14,
      legendColor: hex(colors.ink),
      showValue: true,
      dataLabelColor: "FFFFFF",
      dataLabelFontFace: FONT,
      dataLabelFontSize: 12,
      dataLabelFormatCode: "#,##0.##",
    });
    return;
  }

  if (chart.type === "line") {
    slide.addChart(pptx.ChartType.line, chart.series.map((series) => ({ name: series.name, labels: chart.labels, values: series.values })), {
      ...box,
      ...axes,
      chartColors: chart.series.map((_, i) => hex(colors.series[i]!)),
      lineSize: 3,
      lineDataSymbol: "circle",
      lineDataSymbolSize: 8,
      showValue: chart.series.length === 1,
      dataLabelPosition: "t",
    });
    return;
  }

  // One series with a highlight: split it into two stacked series so the highlighted bar alone
  // takes the accent, while staying a single editable chart.
  if (chart.series.length === 1 && chart.type === "bar" && chart.highlight !== null) {
    const values = chart.series[0]!.values;
    const name = chart.series[0]!.name;
    slide.addChart(pptx.ChartType.bar, [
      { name, labels: chart.labels, values: values.map((v, i) => (i === chart.highlight ? 0 : v)) },
      { name: `${name} (highlighted)`, labels: chart.labels, values: values.map((v, i) => (i === chart.highlight ? v : 0)) },
    ], { ...box, ...axes, showLegend: false, barDir: "col", barGrouping: "stacked", barGapWidthPct: 70, chartColors: [hex(colors.quiet), hex(colors.accent)], showValue: true, dataLabelPosition: "inEnd" });
    return;
  }

  slide.addChart(pptx.ChartType.bar, chart.series.map((series) => ({ name: series.name, labels: chart.labels, values: series.values })), {
    ...box,
    ...axes,
    barDir: "col",
    barGrouping: chart.type === "stacked" ? "stacked" : "clustered",
    barGapWidthPct: 70,
    chartColors: chart.series.map((_, i) => hex(colors.series[i]!)),
    showValue: chart.series.length === 1 || chart.type === "stacked",
    dataLabelPosition: chart.type === "stacked" ? "ctr" : "outEnd",
    ...(chart.type === "stacked" ? { dataLabelColor: hex(colors.paper) } : {}),
  });
}

/** The deck as .pptx bytes. Made on demand, never stored. */
export async function renderPptx(deck: Deck): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = deck.title;
  pptx.company = deck.meta.wordmark ?? "Mates";
  pptx.author = deck.meta.presenter ?? "Mates";
  deck.slides.forEach((item, index) => {
    const scene = sceneOf(deck, index);
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
    slide.addText("Sources", { x: inch(96), y: inch(92), w: inch(CANVAS.width - 192), h: inch(70), fontFace: FONT, fontSize: pt(48), color: hex(p.ink), charSpacing: pt(-1), margin: 0 });
    slide.addText(
      deck.sources.map((source, i) => ({
        text: source.url ? `${source.title}  ${source.url}` : source.title,
        options: { breakLine: i < deck.sources.length - 1, paraSpaceAfter: 8, color: hex(p.muted), ...(source.url ? { hyperlink: { url: source.url } } : {}) },
      })),
      { x: inch(96), y: inch(244), w: inch(CANVAS.width - 192), h: inch(400), fontFace: FONT, fontSize: pt(18), valign: "top", margin: 0 },
    );
  }
  return (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
}
