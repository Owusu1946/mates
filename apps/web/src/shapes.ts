import { SHAPE, type PolygonShape } from "@muse-clone/mascot";

/**
 * Extra mascot silhouettes for the landing page. Same 200-unit artwork box, fit and corner
 * construction as the mascot's hexagon, so the engine animates them exactly like it. The app
 * still uses only the hexagon; these move into packages/mascot when the app adopts them.
 */

const fit = SHAPE.fit;
const outline = (d: string): Pick<PolygonShape, "body" | "clip"> => ({
  body: `<path xmlns="http://www.w3.org/2000/svg" fill="{{GRADIENT}}" d="${d}"/>`,
  clip: `<path xmlns="http://www.w3.org/2000/svg" d="${d}"/>`,
});

/** r=90: sized to look as heavy as the hexagon beside it. */
export const CIRCLE: PolygonShape = {
  name: "Circle",
  fit,
  ...outline("M100 10A90 90 0 1 1 100 190A90 90 0 1 1 100 10Z"),
  anchor: { x: 106, y: 103, scale: 1.14 },
};

/** Point up, corners rounded like the hexagon's. The face sits low and a little smaller, where the shape is wide. */
export const TRIANGLE: PolygonShape = {
  name: "Rounded triangle",
  fit,
  ...outline("M88.00 42.51Q100.00 21.73 112.00 42.51L183.00 165.49Q195.00 186.27 171.00 186.27L29.00 186.27Q5.00 186.27 17.00 165.49Z"),
  anchor: { x: 107, y: 150, scale: 0.8 },
};

export type ShapeName = "hexagon" | "circle" | "triangle";
export const SHAPES: Record<ShapeName, PolygonShape> = { hexagon: SHAPE, circle: CIRCLE, triangle: TRIANGLE };
