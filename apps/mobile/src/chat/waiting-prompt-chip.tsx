import { Pressable, Text, View } from "react-native";
import { useTheme } from "../theme/provider";
import { ChatIcon } from "./chat-icon";

export function WaitingPromptChip({ label, onPress }: { label: string; onPress: () => void }) {
  const { isDark } = useTheme();
  const background = isDark ? "#2b261a" : "#fff8e8";
  const border = isDark ? "#51452f" : "#f0dfb6";
  const accent = isDark ? "#f5c45e" : "#8a5a00";
  const foreground = isDark ? "#fafafa" : "#18181b";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Needs your input. ${label}. Jump to the request.`}
      accessibilityHint="Scrolls to the message waiting for you."
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 54,
        flexDirection: "row",
        alignItems: "center",
        gap: 11,
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderWidth: 1,
        borderColor: border,
        borderRadius: 18,
        borderCurve: "continuous",
        backgroundColor: background,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <ChatIcon name="sparkles" color={accent} size={18} />
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text style={{ color: accent, fontFamily: "DMSans_600SemiBold", fontSize: 11.5 }}>Needs your input</Text>
        <Text numberOfLines={1} style={{ color: foreground, fontFamily: "DMSans_500Medium", fontSize: 13.5 }}>{label}</Text>
      </View>
      <ChatIcon name="next" color={accent} size={17} />
    </Pressable>
  );
}
