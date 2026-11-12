import { CANVAS, chartShapes, sceneOf, type Deck, type TextShape, type VectorShape } from "@muse-clone/decks";
import { memo, useMemo } from "react";
import { Text, View } from "react-native";
import Svg, { Circle, Line, Path, Polyline, Rect } from "react-native-svg";

/**
 * One slide drawn natively from the same shapes the PowerPoint export uses, scaled to `width`.
 * Vectors (rules, boxes, arrows, charts) share one SVG in canvas units; text is native Text with
 * scaled sizes, so it stays sharp at thumbnail and full size alike.
 */
const FONT = { regular: "DMSans_400Regular", bold: "DMSans_700Bold" };
type SlideDeck = Pick<Deck, "theme" | "sources" | "slides" | "meta">;

export const SlideView = memo(function SlideView({ deck, index, width }: { deck: SlideDeck; index: number; width: number }) {
  const { scene, vectors, texts } = useMemo(() => {
    const scene = sceneOf(deck, index);
    const vectors: VectorShape[] = [];
    const texts: TextShape[] = [];
    for (const shape of scene.shapes) {
      if (shape.kind === "chart") for (const part of chartShapes(shape)) (part.kind === "text" ? texts : vectors).push(part);
      else if (shape.kind === "text") texts.push(shape);
      else vectors.push(shape);
    }
    return { scene, vectors, texts };
  }, [deck, index]);
  const s = width / CANVAS.width;
  return (
    <View style={{ width, height: CANVAS.height * s, backgroundColor: scene.background, overflow: "hidden" }}>
      <Svg width={width} height={CANVAS.height * s} viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`} style={{ position: "absolute" }}>
        {vectors.map((shape, i) => (
          <VectorView key={i} shape={shape} />
        ))}
      </Svg>
      {texts.map((shape, i) => (
        <TextView key={i} shape={shape} s={s} />
      ))}
    </View>
  );
});

function VectorView({ shape }: { shape: VectorShape }) {
  switch (shape.kind) {
    case "rect":
      return <Rect x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={shape.radius ?? 0} fill={shape.fill ?? "none"} stroke={shape.stroke} strokeWidth={shape.stroke ? 1.5 : 0} />;
    case "line":
      return shape.arrow ? (
        <>
          <Line x1={shape.x1} y1={shape.y1} x2={shape.x2 - 8} y2={shape.y2} stroke={shape.color} strokeWidth={shape.width} />
          <Path d={`M ${shape.x2} ${shape.y2} l -10 -6 v 12 z`} fill={shape.color} />
        </>
      ) : (
        <Line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} stroke={shape.color} strokeWidth={shape.width} />
      );
    case "path":
      return <Path d={shape.d} fill={shape.fill} />;
    case "circle":
      return <Circle cx={shape.cx} cy={shape.cy} r={shape.r} fill={shape.fill} />;
    case "polyline":
      return <Polyline points={shape.points.map((point) => point.join(",")).join(" ")} fill="none" stroke={shape.color} strokeWidth={shape.width} strokeLinejoin="round" strokeLinecap="round" />;
    case "text":
      return null;
  }
}

function TextView({ shape, s }: { shape: TextShape; s: number }) {
  return (
    <View
      style={{
        position: "absolute",
        left: shape.x * s,
        top: shape.y * s,
        width: shape.w * s,
        height: shape.h * s,
        justifyContent: shape.valign === "middle" ? "center" : shape.valign === "bottom" ? "flex-end" : "flex-start",
      }}
    >
      <Text
        allowFontScaling={false}
        style={{
          fontSize: shape.size * s,
          lineHeight: shape.size * shape.leading * s,
          letterSpacing: (shape.tracking ?? 0) * s,
          fontFamily: shape.bold ? FONT.bold : FONT.regular,
          textAlign: shape.align ?? "left",
          color: shape.runs[0]?.color,
        }}
      >
        {shape.runs.map((run, i) => (
          <Text key={i} style={{ color: run.color }}>
            {run.text}
          </Text>
        ))}
      </Text>
    </View>
  );
}
