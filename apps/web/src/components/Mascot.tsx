import { useEffect, useId, useRef, useState } from "react";
import PolygonAvatar, {
  DEFAULT_GRADIENT,
  EXPRESSIONS,
  MOUTHS,
  MOUTH_STROKE,
  anchorTransform,
  mouthFrame,
  mouthPath,
  toPath,
  type PolygonShape,
  type PolygonState,
} from "@muse-clone/mascot";
import { SHAPES, type ShapeName } from "../shapes";

type Props = { size: number; state?: PolygonState; gradient?: [string, string, string]; shape?: ShapeName; className?: string };

/**
 * The app's own mascot, the same engine the phone runs. Cheap enough to put many on a page:
 *  - the server renders the engine's opening frame, so the face is there before any script;
 *    after hydrating, the live mascot takes over from that exact frame;
 *  - use with `client:visible`, so mascots in hidden or far-off places never load early;
 *  - it pauses whenever it is off screen, so only the mascots you can see are animating.
 * `shape` picks the silhouette; the hexagon is the default and the brand's own.
 */
export default function Mascot({ size, state = "happy", gradient = DEFAULT_GRADIENT, shape = "hexagon", className }: Props) {
  const box = useRef<HTMLSpanElement>(null);
  const [live, setLive] = useState(false);
  const [visible, setVisible] = useState(true);
  const silhouette = SHAPES[shape];

  useEffect(() => {
    setLive(true);
    const node = box.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setVisible(!!entry?.isIntersecting), { rootMargin: "80px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <span ref={box} className={className} style={{ display: "inline-flex", width: size, height: size, lineHeight: 0, flex: "none" }}>
      {live ? (
        <PolygonAvatar size={size} state={state} gradient={gradient} shape={silhouette} title={null} paused={!visible} />
      ) : (
        <OpeningFrame size={size} gradient={gradient} shape={silhouette} />
      )}
    </span>
  );
}

/** The engine's first frame (expression 0), drawn without the engine. */
function OpeningFrame({ size, gradient, shape }: { size: number; gradient: [string, string, string]; shape: PolygonShape }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const rings = EXPRESSIONS[0]!;
  const spec = MOUTHS[0]!;
  const body = shape.body.match(/ d="([^"]+)"/)![1];
  return (
    <svg viewBox="-15 -15 258.541 258.541" width={size} height={size} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}g`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={gradient[0]} />
          <stop offset="55%" stopColor={gradient[1]} />
          <stop offset="100%" stopColor={gradient[2]} />
        </linearGradient>
        {/* The face stays inside the silhouette, as in the engine. */}
        <clipPath id={`${id}c`} transform={shape.fit || undefined}>
          <path d={body} />
        </clipPath>
      </defs>
      <path transform={shape.fit || undefined} fill={`url(#${id}g)`} d={body} />
      <g clipPath={`url(#${id}c)`}>
        <g transform={anchorTransform(shape.anchor)}>
          <path fill="#fff" d={toPath(rings[0]!)} />
          <path fill="#fff" d={toPath(rings[1]!)} />
          <path fill="none" stroke="#fff" strokeWidth={MOUTH_STROKE} strokeLinecap="round" d={mouthPath(mouthFrame(rings, spec), spec)} />
        </g>
      </g>
    </svg>
  );
}
