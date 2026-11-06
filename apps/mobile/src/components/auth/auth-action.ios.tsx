import { Host, Button, Text } from "@expo/ui";
import {
  accessibilityLabel,
  buttonStyle,
  buttonBorderShape,
  controlSize,
  font,
  foregroundStyle,
  frame,
} from "@expo/ui/swift-ui/modifiers";
import { haptic } from "../../haptics";
import { authLayout, useAuthTheme } from "../../theme/auth";
import type { AuthActionProps } from "./auth-action";

// The universal Button renders SwiftUI on iOS. Keep native press and accessibility behavior.
export function AuthAction({
  title,
  onPress,
  disabled,
  loading,
  testID,
}: AuthActionProps) {
  const { colors, isDark } = useAuthTheme();
  return (
    <Host
      matchContents={{ vertical: true }}
      colorScheme={isDark ? "dark" : "light"}
      seedColor={colors.button}
      style={{ width: "100%" }}
    >
      <Button
        testID={testID}
        disabled={disabled || loading}
        onPress={() => {
          haptic.light();
          onPress();
        }}
        modifiers={[
          buttonStyle("borderedProminent"),
          buttonBorderShape("capsule"),
          controlSize("large"),
          accessibilityLabel(loading ? `${title}, in progress` : title),
        ]}
      >
        <Text
          modifiers={[
            font({ size: authLayout.textSize, weight: "semibold" }),
            foregroundStyle(colors.buttonText),
            frame({
              maxWidth: Infinity,
              minHeight: authLayout.buttonHeight - 24,
            }),
          ]}
        >
          {loading ? "Please wait…" : title}
        </Text>
      </Button>
    </Host>
  );
}
