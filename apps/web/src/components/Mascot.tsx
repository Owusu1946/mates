import PolygonAvatar, { type PolygonState } from "../../../mobile/src/components/polygon-avatar/polygon-avatar-core";

/** The app's own mascot, the same file the phone renders. */
export default function Mascot({ size, state = "happy" }: { size: number; state?: PolygonState }) {
  return (
    <span style={{ display: "inline-flex", width: size, height: size, lineHeight: 0 }}>
      <PolygonAvatar size={size} state={state} title={null} />
    </span>
  );
}
