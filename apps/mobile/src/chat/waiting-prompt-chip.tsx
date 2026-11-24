import { Pressable, Text, View } from "react-native";
import { useTheme } from "../theme/provider";

export function WaitingPromptChip({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Needs your input. ${label}. Jump to the request.`}
      accessibilityHint="Scrolls to the message waiting for you."
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 52,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 15,
        borderCurve: "continuous",
        backgroundColor: colors.surface,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text style={{ color: colors.textSecondary, fontFamily: "DMSans_500Medium", fontSize: 11.5 }}>Needs your input</Text>
        <Text numberOfLines={1} style={{ color: colors.text, fontFamily: "DMSans_600SemiBold", fontSize: 13.5 }}>{label}</Text>
      </View>
      <Text style={{ color: colors.primary, fontFamily: "DMSans_600SemiBold", fontSize: 12.5 }}>Open</Text>
    </Pressable>
  );
}
