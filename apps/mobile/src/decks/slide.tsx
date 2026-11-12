import { BULLET_INDENT, CANVAS, sceneOf, type ChartShape, type Deck, type Shape, type Slide } from "@muse-clone/decks";
import { memo, useMemo } from "react";
import { Text, View } from "react-native";
import Svg, { Circle, G, Line, Path, Polyline, Rect, Text as SvgText } from "react-native-svg";

/**
 * One slide drawn natively from the same shapes the PowerPoint export uses, scaled to `width`.
 * Coordinates and font sizes are multiplied rather than transformed, so text stays sharp at
 * thumbnail and full size alike.
 */
const FONT = { regular: "DMSans_400Regular", bold: "DMSans_700Bold" };

export const SlideView = memo(function SlideView({ deck, slide, index, total, width }: { deck: Pick<Deck, "theme" | "sources">; slide: Slide; index: number; total: number; width: number }) {
  const scene = useMemo(() => sceneOf(deck, slide, index, total), [deck, slide, index, total]);
  const s = width / CANVAS.width;
  return (
    <View style={{ width, height: CANVAS.height * s, backgroundColor: scene.background, overflow: "hidden" }}>
      {scene.shapes.map((shape, i) => (
        <ShapeView key={i} shape={shape} s={s} />
      ))}
    </View>
  );
});

function ShapeView({ shape, s }: { shape: Shape; s: number }) {
  const frame = { position: "absolute" as const, left: shape.x * s, top: shape.y * s, width: shape.w * s, height: shape.h * s };
  switch (shape.kind) {
    case "rect":
      return <View style={{ ...frame, backgroundColor: shape.fill, borderRadius: (shape.radius ?? 0) * s }} />;
    case "text":
      return (
        <View style={{ ...frame, justifyContent: shape.valign === "middle" ? "center" : shape.valign === "bottom" ? "flex-end" : "flex-start" }}>
          <Text
            allowFontScaling={false}
            style={{ color: shape.color, fontSize: shape.size * s, lineHeight: shape.size * shape.leading * s, fontFamily: shape.bold ? FONT.bold : FONT.regular, textAlign: shape.align ?? "left" }}
          >
            {shape.text}
          </Text>
        </View>
      );
    case "list":
      return (
        <View style={{ ...frame, gap: shape.gap * s }}>
          {shape.items.map((item, i) => (
            <View key={i} style={{ flexDirection: "row" }}>
              <Text allowFontScaling={false} style={{ width: BULLET_INDENT * s, color: shape.color, fontSize: shape.size * s, lineHeight: shape.size * shape.leading * s, fontFamily: FONT.regular }}>
                {shape.bullet}
              </Text>
              <Text allowFontScaling={false} style={{ flex: 1, color: shape.color, fontSize: shape.size * s, lineHeight: shape.size * shape.leading * s, fontFamily: FONT.regular }}>
                {item}
              </Text>
            </View>
          ))}
        </View>
      );
    case "chart":
      return (
        <View style={frame}>
          <ChartView shape={shape} s={s} />
        </View>
      );
  }
}

const formatValue = (value: number) => (Math.abs(value) >= 1000 ? value.toLocaleString() : String(Math.round(value * 100) / 100));

function ChartView({ shape, s }: { shape: ChartShape; s: number }) {
  const { chart, colors, ink, muted } = shape;
  const w = shape.w * s;
  const h = shape.h * s;
  const label = 16 * s;
  const values = chart.points.map((p) => p.value);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;

  if (chart.type === "pie") {
    const total = values.reduce((sum, v) => sum + Math.max(0, v), 0) || 1;
    const r = Math.min(h, w * 0.5) / 2 - 8 * s;
    const cx = r + 8 * s;
    const cy = h / 2;
    let angle = -Math.PI / 2;
    return (
      <Svg width={w} height={h}>
        {chart.points.map((point, i) => {
          const sweep = (Math.max(0, point.value) / total) * Math.PI * 2;
          const [x1, y1] = [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
          angle += sweep;
          const [x2, y2] = [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
          const d = sweep >= Math.PI * 2 - 1e-6 ? `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0` : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z`;
          return <Path key={i} d={d} fill={colors[i % colors.length]} />;
        })}
        {chart.points.map((point, i) => {
          const y = cy - (chart.points.length * 34 * s) / 2 + i * 34 * s;
          return (
            <G key={`l${i}`}>
              <Rect x={cx + r + 40 * s} y={y} width={18 * s} height={18 * s} rx={4 * s} fill={colors[i % colors.length]} />
              <SvgText x={cx + r + 68 * s} y={y + 15 * s} fill={ink} fontSize={18 * s} fontFamily={FONT.regular}>
                {`${point.label}  ${formatValue(point.value)}${chart.unit ? ` ${chart.unit}` : ""}`}
              </SvgText>
            </G>
          );
        })}
      </Svg>
    );
  }

  const top = 28 * s;
  const bottom = h - label - 14 * s;
  const y = (v: number) => bottom - ((v - min) / span) * (bottom - top);
  const step = w / chart.points.length;

  if (chart.type === "line") {
    const xs = chart.points.map((_, i) => step * i + step / 2);
    return (
      <Svg width={w} height={h}>
        <Line x1={0} x2={w} y1={y(min)} y2={y(min)} stroke={muted} strokeOpacity={0.4} strokeWidth={1} />
        <Polyline points={xs.map((x, i) => `${x},${y(values[i]!)}`).join(" ")} fill="none" stroke={colors[0]} strokeWidth={4 * s} strokeLinejoin="round" />
        {xs.map((x, i) => (
          <G key={i}>
            <Circle cx={x} cy={y(values[i]!)} r={7 * s} fill={colors[0]} />
            <SvgText x={x} y={y(values[i]!) - 14 * s} fill={ink} fontSize={16 * s} fontFamily={FONT.bold} textAnchor="middle">
              {formatValue(values[i]!)}
            </SvgText>
            <SvgText x={x} y={h - 4 * s} fill={muted} fontSize={label} fontFamily={FONT.regular} textAnchor="middle">
              {chart.points[i]!.label}
            </SvgText>
          </G>
        ))}
      </Svg>
    );
  }

  const bar = step * 0.6;
  return (
    <Svg width={w} height={h}>
      {chart.points.map((point, i) => {
        const x = step * i + (step - bar) / 2;
        const top = Math.min(y(point.value), y(0));
        return (
          <G key={i}>
            <Rect x={x} y={top} width={bar} height={Math.max(1, Math.abs(y(point.value) - y(0)))} rx={6 * s} fill={colors[0]} />
            <SvgText x={x + bar / 2} y={top - 10 * s} fill={ink} fontSize={18 * s} fontFamily={FONT.bold} textAnchor="middle">
              {formatValue(point.value)}
            </SvgText>
            <SvgText x={x + bar / 2} y={h - 4 * s} fill={muted} fontSize={label} fontFamily={FONT.regular} textAnchor="middle">
              {point.label}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}
