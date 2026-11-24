import { Text, View } from "react-native";
import { PulseDot } from "./pulse-dot";

export function ThinkingStatus({ mateName, color, mutedColor }: { mateName: string; color: string; mutedColor: string }) {
  return (
    <View accessibilityLiveRegion="polite" accessibilityLabel={`${mateName} is thinking`} style={{ flexDirection: "row", alignItems: "center", gap: 9, paddingTop: 7, paddingBottom: 8 }}>
      <PulseDot color={color} size={7} />
      <Text style={{ color: mutedColor, fontFamily: "DMSans_500Medium", fontSize: 14 }}>{mateName} is thinking…</Text>
    </View>
  );
}
