import { ActivityIndicator, Pressable, Text } from "react-native";
import { haptic } from "../../haptics";
import { authLayout, useAuthTheme } from "../../theme/auth";

export interface AuthActionProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
}
export function AuthAction({
  title,
  onPress,
  disabled,
  loading,
  testID,
}: AuthActionProps) {
  const { colors } = useAuthTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{
        disabled: !!(disabled || loading),
        busy: !!loading,
      }}
      disabled={disabled || loading}
      onPress={() => {
        haptic.light();
        onPress();
      }}
      style={({ pressed }) => ({
        minHeight: authLayout.buttonHeight,
        borderRadius: authLayout.controlRadius,
        padding: authLayout.gap,
        backgroundColor: colors.button,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
      })}
    >
      {loading ? (
        <ActivityIndicator color={colors.buttonText} />
      ) : (
        <Text
          style={{
            color: colors.buttonText,
            fontSize: authLayout.textSize,
            fontWeight: "600",
          }}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}
