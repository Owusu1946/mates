import { Pressable, Text } from "react-native";
import { haptic } from "../haptics";
import { useTheme } from "../theme/provider";

/**
 * A button for cards inside the chat. Plain React Native on purpose: a native SwiftUI button in a
 * <Host matchContents> measures itself after the list has laid out, so inside a scrolling thread
 * its label could land outside the card. This one is sized by layout like everything around it.
 *
 * `text` keeps an 8px inset so rows that pull left by -8 (to align text buttons with copy) still line up.
 */
export function CardButton({
  label,
  onPress,
  variant = "filled",
  disabled = false,
  align = "start",
}: {
  label: string;
  onPress: () => void;
  variant?: "filled" | "outlined" | "text";
  disabled?: boolean;
  align?: "start" | "end";
}) {
  const { colors } = useTheme();
  const filled = variant === "filled";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={variant === "text" ? 6 : 2}
      onPress={() => {
        haptic.light();
        onPress();
      }}
      style={({ pressed }) => ({
        minHeight: variant === "text" ? 36 : 40,
        paddingHorizontal: variant === "text" ? 8 : 16,
        borderRadius: 20,
        alignItems: "center",
        justifyContent: "center",
        alignSelf: align === "end" ? "flex-end" : "flex-start",
        backgroundColor: filled ? colors.text : "transparent",
        borderWidth: variant === "outlined" ? 1 : 0,
        borderColor: colors.border,
        opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
      })}
    >
      <Text numberOfLines={1} style={{ color: filled ? colors.background : colors.text, fontSize: 14.5, fontFamily: "DMSans_600SemiBold" }}>
        {label}
      </Text>
    </Pressable>
  );
}
