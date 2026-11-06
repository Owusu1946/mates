"use dom";

import PolygonAvatar, { type PolygonState } from "./polygon-avatar-core";

export default function PolygonAvatarDom({
  state = "idle",
  size = 100,
  gradient,
}: {
  state?: PolygonState;
  size?: number;
  gradient?: [string, string, string];
  dom?: import("expo/dom").DOMProps;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        margin: 0,
        padding: 0,
        overflow: "hidden",
        lineHeight: 0,
      }}
    >
      <PolygonAvatar state={state} size={size} gradient={gradient} />
    </div>
  );
}
