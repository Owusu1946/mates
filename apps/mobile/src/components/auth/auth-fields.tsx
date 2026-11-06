import { useState } from "react";
import {
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { Icon } from "../ui/icon";
import { authLayout, useAuthTheme } from "../../theme/auth";

export function AuthField({
  label,
  secureTextEntry,
  ...props
}: TextInputProps & { label: string }) {
  const { colors } = useAuthTheme();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  return (
    <View style={{ gap: authLayout.smallGap }}>
      <Text
        style={{
          color: colors.secondary,
          fontSize: authLayout.captionSize,
          fontWeight: "500",
        }}
      >
        {label}
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          height: authLayout.buttonHeight,
          width: "100%",
          backgroundColor: colors.field,
          borderColor: focused ? colors.accent : colors.border,
          borderWidth: 1,
          borderRadius: authLayout.fieldRadius,
          borderCurve: "continuous",
        }}
      >
        <TextInput
          {...props}
          accessibilityLabel={label}
          secureTextEntry={secureTextEntry && !revealed}
          placeholderTextColor={colors.muted}
          selectionColor={colors.accent}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            flex: 1,
            height: "100%",
            minWidth: 0,
            paddingHorizontal: authLayout.gap,
            paddingVertical: 0,
            fontSize: authLayout.textSize,
            color: colors.text,
          }}
        />
        {secureTextEntry && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? "Hide password" : "Show password"}
            onPress={() => setRevealed(!revealed)}
            style={({ pressed }) => ({
              minWidth: 48,
              minHeight: 48,
              flexShrink: 0,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.5 : 1,
            })}
          >
            <Icon
              name={revealed ? "eye-off" : "eye"}
              size={20}
              color={colors.secondary}
            />
          </Pressable>
        )}
      </View>
    </View>
  );
}
export function AuthMessage({
  message,
  success = false,
}: {
  message?: string | null;
  success?: boolean;
}) {
  const { colors } = useAuthTheme();
  if (!message) return null;
  return (
    <Text
      selectable
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{
        color: success ? colors.success : colors.error,
        backgroundColor: success ? colors.field : colors.errorSurface,
        padding: authLayout.gap,
        borderRadius: authLayout.fieldRadius,
        fontSize: authLayout.captionSize,
        lineHeight: 20,
      }}
    >
      {message}
    </Text>
  );
}
export function AuthLink({
  title,
  onPress,
  disabled,
  testID,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  const { colors } = useAuthTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.4 : pressed ? 0.5 : 1,
      })}
    >
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>
        {title}
      </Text>
    </Pressable>
  );
}
