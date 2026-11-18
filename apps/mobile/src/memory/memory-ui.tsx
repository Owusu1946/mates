import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/provider";

/** Pieces the Memory screens share, so Import looks like the screen it opens from. */
export const font = { regular: "DMSans_400Regular", medium: "DMSans_500Medium", semibold: "DMSans_600SemiBold" };

/** Rows on one rounded surface, separated by hairlines: no box per row. */
export function Group({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const rows = (Array.isArray(children) ? children : [children]).flat().filter(Boolean);
  return (
    <View style={{ borderRadius: 18, borderCurve: "continuous", overflow: "hidden", backgroundColor: colors.surface }}>
      {rows.map((row, i) => (
        <View key={i}>
          {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, marginLeft: 16, backgroundColor: colors.border }} />}
          {row}
        </View>
      ))}
    </View>
  );
}

export function SmallButton({ label, strong, disabled, onPress }: { label: string; strong?: boolean; disabled?: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: strong ? colors.text : colors.surfaceElevated, opacity: disabled ? 0.35 : pressed ? 0.7 : 1 })}
    >
      <Text style={{ color: strong ? colors.background : colors.text, fontFamily: font.semibold, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}
