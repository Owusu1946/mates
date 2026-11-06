import {
  anchorTransform,
  DEFAULT_GRADIENT,
  FACE_BOX,
  MOUTH_STROKE,
  type PolygonAvatarLayers,
  type PolygonShape,
  SHAPE,
} from "./polygon-avatar-core";
import { MockSvgElement, parseSvgMarkup } from "./mock-svg-element";

export type PolygonScene = {
  root: MockSvgElement;
  layers: PolygonAvatarLayers;
  paint: string;
};

export interface PolygonSceneOptions {
  shape?: PolygonShape;
  showMouth?: boolean;
  eyeColor?: string;
  mouthStroke?: number;
  flip?: boolean;
  gradient?: [string, string, string];
}

const el = (tag: string, attrs: Record<string, string | undefined> = {}, children: MockSvgElement[] = []) => {
  const node = new MockSvgElement(tag);
  for (const [name, value] of Object.entries(attrs)) if (value) node.setAttribute(name, value);
  for (const child of children) node.appendChild(child);
  return node;
};

/**
 * The same tree the web component renders, built from mock nodes so the shared engine can
 * draw into it on native. Keep the structure in step with PolygonAvatar's JSX.
 */
export function createPolygonAvatarScene(uid: string, options: PolygonSceneOptions = {}): PolygonScene {
  const {
    shape = SHAPE,
    showMouth = true,
    eyeColor = "#ffffff",
    mouthStroke = MOUTH_STROKE,
    flip = false,
    gradient = DEFAULT_GRADIENT,
  } = options;
  const gradId = `${uid}-grad`;
  const clipId = `${uid}-clip`;
  const ownFill = shape.body.includes("{{GRADIENT}}") ? null : shape.body.match(/fill="(?!none)([^"]+)"/)?.[1];
  const paint = ownFill ?? `url(#${gradId})`;

  const defs = el("defs", {}, [
    el("linearGradient", { id: gradId, x1: "1", y1: "0", x2: "0", y2: "1" }, [
      el("stop", { offset: "0%", "stop-color": gradient[0] }),
      el("stop", { offset: "55%", "stop-color": gradient[1] }),
      el("stop", { offset: "100%", "stop-color": gradient[2] }),
    ]),
    el("clipPath", { id: clipId, transform: shape.fit || undefined }, parseSvgMarkup(shape.clip)),
  ]);

  const eye0 = el("path", { fill: eyeColor });
  const eye1 = el("path", { fill: eyeColor });
  const mouth = el("path", { fill: "none", stroke: eyeColor, "stroke-width": String(mouthStroke), "stroke-linecap": "round" });
  const faceLayer = el("g", { "clip-path": `url(#${clipId})` }, [
    el("g", { transform: anchorTransform(shape.anchor) }, showMouth ? [eye0, eye1, mouth] : [eye0, eye1]),
  ]);
  const body = parseSvgMarkup(shape.body.replace(/\{\{GRADIENT\}\}/g, `url(#${gradId})`));
  const bodyContent = el("g", {}, [el("g", { transform: shape.fit || undefined }, body), faceLayer]);
  const glyphLayer = el("g");
  glyphLayer.style.opacity = "0";
  const bodyGroup = el("g", {}, [bodyContent, glyphLayer]);

  const trailLayer = el("g");
  const dotsLayer = el("g");
  const trailFrontLayer = el("g");
  const confettiLayer = el("g");
  const overlayLayer = el("g");

  const root = el("svg", {}, [
    defs,
    el("g", { transform: flip ? `translate(${FACE_BOX} 0) scale(-1 1)` : undefined }, [
      trailLayer,
      dotsLayer,
      bodyGroup,
      trailFrontLayer,
      confettiLayer,
      overlayLayer,
    ]),
  ]);

  // The engine is typed against DOM nodes; the mock implements the subset it touches.
  const layers = {
    eye0, eye1, mouth, bodyGroup, bodyContent, trailLayer, trailFrontLayer,
    confettiLayer, glyphLayer, overlayLayer, dotsLayer, faceLayer,
  } as unknown as PolygonAvatarLayers;
  return { root, layers, paint };
}
