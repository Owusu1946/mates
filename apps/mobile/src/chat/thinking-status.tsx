import { Text, View } from "react-native";
import type { Gradient } from "../mates/data";
import { MateAvatar } from "../mates/mate-avatar";

export function ThinkingStatus({ mateName, gradient, shape, mutedColor }: { mateName: string; gradient?: Gradient; shape?: string; mutedColor: string }) {
  return (
    <View accessibilityLiveRegion="polite" accessibilityLabel={`${mateName} is thinking`} style={{ flexDirection: "row", alignItems: "center", gap: 9, paddingTop: 7, paddingBottom: 8 }}>
      <MateAvatar gradient={gradient} shape={shape} size={22} still />
      <Text style={{ color: mutedColor, fontFamily: "DMSans_500Medium", fontSize: 14 }}>{mateName} is thinking…</Text>
    </View>
  );
}
