import React, { useEffect, useId, useMemo, useReducer, useRef, useState } from "react";
import { AppState } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import Svg, { Circle, ClipPath, Defs, G, LinearGradient, Path, Stop } from "react-native-svg";
import {
  DEFAULT_GRADIENT,
  FACE_BOX,
  MOUTH_STROKE,
  SHAPE,
  setPolygonSvgDocument,
  usePolygonEngine,
  type PolygonAvatarProps,
} from "./polygon-avatar-core";
import { createMockSvgDocument, type MockSvgElement } from "./mock-svg-element";
import { createPolygonAvatarScene } from "./polygon-avatar-scene";

// Effects create their pooled nodes through this document instead of a browser's.
setPolygonSvgDocument(createMockSvgDocument());

const VIEW_BOX = `-15 -15 ${FACE_BOX + 30} ${FACE_BOX + 30}`;

const COMPONENTS: Record<string, React.ComponentType<any>> = {
  g: G,
  path: Path,
  circle: Circle,
  defs: Defs,
  linearGradient: LinearGradient,
  stop: Stop,
  clipPath: ClipPath,
};

const PROP_NAMES: Record<string, string> = {
  "stroke-width": "strokeWidth",
  "stroke-linecap": "strokeLinecap",
  "stop-color": "stopColor",
  "stop-opacity": "stopOpacity",
  "clip-path": "clipPath",
};

function nodeProps(node: MockSvgElement, inherited?: string) {
  const props: Record<string, string> = {};
  for (const [name, value] of Object.entries(node.attrs)) {
    if (name.startsWith("data-")) continue;
    props[PROP_NAMES[name] ?? name] = value;
  }
  // As in CSS, an inline style opacity wins over the presentation attribute.
  if (node.style.opacity !== undefined) props.opacity = node.style.opacity;
  // A clipPath's own transform applies to its contents; react-native-svg reads it per shape.
  if (inherited) props.transform = props.transform ? `${inherited} ${props.transform}` : inherited;
  return props;
}

function renderNode(node: MockSvgElement, key: number, inherited?: string): React.ReactNode {
  const Component = COMPONENTS[node.tagName];
  if (!Component) return null;
  if (node.tagName === "clipPath") {
    const { transform, ...props } = nodeProps(node);
    return <ClipPath key={key} {...props}>{node.children.map((child, i) => renderNode(child, i, transform))}</ClipPath>;
  }
  return (
    <Component key={key} {...nodeProps(node, inherited)}>
      {node.children.length ? node.children.map((child, i) => renderNode(child, i)) : undefined}
    </Component>
  );
}

export interface NativePolygonAvatarProps extends Omit<PolygonAvatarProps, "size" | "className" | "style"> {
  size?: number;
  /** Drawn frames per second. Lower it for small or secondary avatars on slow phones. */
  frameRate?: number;
}

/**
 * Native PolygonAvatar: the same engine, shapes and states as the web component, drawn with
 * react-native-svg instead of a DOM, so it needs no WebView.
 */
export function PolygonAvatar({
  state = "idle",
  expression,
  size = 160,
  gaze,
  turn,
  lookAround,
  flip = false,
  spring,
  eyeScale,
  showMouth = true,
  mouthStroke = MOUTH_STROKE,
  motion,
  effects,
  glyphs,
  autoBlink,
  autoExpression,
  paused = false,
  sequence,
  sequenceName,
  life,
  shape = SHAPE,
  gradient = DEFAULT_GRADIENT,
  eyeColor = "#ffffff",
  title,
  frameRate = 60,
}: NativePolygonAvatarProps) {
  const reactId = useId();
  const uid = useMemo(() => "mascot" + reactId.replace(/[^a-zA-Z0-9]/g, ""), [reactId]);
  const reducedMotion = useReducedMotion();
  // Only a real background pauses it: at launch the state can still read "unknown".
  const [background, setBackground] = useState(AppState.currentState === "background");
  const [, redraw] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => setBackground(next === "background"));
    return () => subscription.remove();
  }, []);

  const [g0, g1, g2] = gradient;
  const scene = useMemo(
    () => createPolygonAvatarScene(uid, { shape, showMouth, eyeColor, mouthStroke, flip, gradient: [g0, g1, g2] }),
    [uid, shape, showMouth, eyeColor, mouthStroke, flip, g0, g1, g2],
  );
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  usePolygonEngine({
    props: {
      state, expression, gaze, turn, lookAround, spring, eyeScale, showMouth, effects, glyphs,
      autoBlink, autoExpression, sequence, sequenceName, life, paused: paused || background,
    },
    uid,
    motionStrength: motion ?? (reducedMotion ? 0 : 1),
    layers: () => sceneRef.current.layers,
    paint: () => sceneRef.current.paint,
    onFrame: redraw,
    frameInterval: frameRate >= 60 ? undefined : (1000 / frameRate) * 0.9,
  });

  const label = title === undefined ? `${shape.name} mascot` : title;
  return (
    <Svg
      width={size}
      height={size}
      viewBox={VIEW_BOX}
      accessible={!!label}
      accessibilityRole={label ? "image" : undefined}
      accessibilityLabel={label ?? undefined}
    >
      {scene.root.children.map((child, i) => renderNode(child, i))}
    </Svg>
  );
}

export default PolygonAvatar;
