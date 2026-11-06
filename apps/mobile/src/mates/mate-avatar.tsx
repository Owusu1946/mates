import { View } from "react-native";
import { PolygonAvatar } from "../components/polygon-avatar/polygon-avatar";
import type { PolygonState } from "../components/polygon-avatar/polygon-avatar-core";
import { DEFAULT_GRADIENT, type Gradient } from "./data";

/** A mate's polygon face. Lists pass `still` so dozens of rows cost one frame each. */
export function MateAvatar({ gradient, size, still = false, state = "idle" }: { gradient?: Gradient; size: number; still?: boolean; state?: PolygonState }) {
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <PolygonAvatar state={state} size={size} gradient={gradient ?? DEFAULT_GRADIENT} paused={still} frameRate={size >= 120 ? 60 : 30} title={null} />
    </View>
  );
}

/** Up to three members overlapped, the way messaging apps show a group. */
export function GroupAvatar({ gradients, size }: { gradients: Gradient[]; size: number }) {
  const shown = gradients.slice(0, 3);
  if (shown.length <= 1) return <MateAvatar gradient={shown[0]} size={size} still />;
  const small = Math.round(size * 0.62);
  const positions = shown.length === 2 ? [{ left: 0, top: 0 }, { left: size - small, top: size - small }] : [{ left: (size - small) / 2, top: 0 }, { left: 0, top: size - small }, { left: size - small, top: size - small }];
  return (
    <View style={{ width: size, height: size }}>
      {shown.map((gradient, i) => (
        <View key={i} style={{ position: "absolute", ...positions[i] }}>
          <MateAvatar gradient={gradient} size={small} still />
        </View>
      ))}
    </View>
  );
}
