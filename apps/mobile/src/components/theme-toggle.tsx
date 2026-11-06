import { Pressable, StyleSheet, Text, View } from "react-native";
import { haptic } from "../haptics";
import { useTheme } from "../theme";

export function ThemeToggle() {
  const { colorScheme, toggleTheme } = useTheme();

  const handleToggle = () => {
    haptic.selection();
    toggleTheme();
  };

  return (
    <Pressable
      testID="theme-toggle"
      onPress={handleToggle}
      style={({ pressed }) => [
        styles.toggle,
        {
          borderColor: colorScheme === "dark" ? "#334155" : "#e2e8f0",
          backgroundColor: colorScheme === "dark" ? "#1e293b" : "#f1f5f9",
          opacity: pressed ? 0.7 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={"Toggle theme, currently " + colorScheme}
    >
      <Text style={styles.icon}>{colorScheme === "dark" ? "🌙" : "☀️"}</Text>
      <Text
        style={[
          styles.label,
          { color: colorScheme === "dark" ? "#f8fafc" : "#0f172a" },
        ]}
      >
        {colorScheme === "dark" ? "Dark" : "Light"}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  icon: { fontSize: 13 },
  label: { fontSize: 12, fontWeight: "600" },
});
