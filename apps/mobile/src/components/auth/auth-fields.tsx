import { useState, type Ref } from "react";
import { Pressable, Text, TextInput, View, type TextInputProps } from "react-native";
import { Icon } from "../ui/icon";
import { authLayout, useAuthTheme } from "../../theme/auth";

/**
 * A borderless field whose placeholder is its label; the outline appears only while focused. An
 * `error` outlines it in red and says what's wrong underneath; otherwise a `hint` can sit there.
 */
export function AuthField({
  label,
  secureTextEntry,
  error,
  hint,
  ref,
  ...props
}: TextInputProps & { label: string; error?: string | null; hint?: string | null; ref?: Ref<TextInput> }) {
  const { colors } = useAuthTheme();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const note = error || hint;
  return (
    <View style={{ width: "100%", gap: 6 }}>
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        height: 56,
        width: "100%",
        backgroundColor: colors.field,
        borderColor: error ? colors.error : focused ? colors.accent : "transparent",
        borderWidth: 1.5,
        borderRadius: authLayout.fieldRadius,
        borderCurve: "continuous",
      }}
    >
      <TextInput
        {...props}
        ref={ref}
        placeholder={props.placeholder ?? label}
        accessibilityLabel={label}
        accessibilityHint={error ?? hint ?? undefined}
        secureTextEntry={secureTextEntry && !revealed}
        placeholderTextColor={colors.muted}
        selectionColor={colors.accent}
        onFocus={(event) => {
          setFocused(true);
          props.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          props.onBlur?.(event);
        }}
        style={{ flex: 1, height: "100%", minWidth: 0, paddingHorizontal: 18, paddingVertical: 0, fontSize: authLayout.textSize, color: colors.text }}
      />
      {secureTextEntry && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={revealed ? "Hide password" : "Show password"}
          onPress={() => setRevealed(!revealed)}
          style={({ pressed }) => ({ minWidth: 52, minHeight: 48, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.5 : 1 })}
        >
          <Icon name={revealed ? "eye-off" : "eye"} size={20} color={colors.secondary} />
        </Pressable>
      )}
    </View>
    {note ? (
      <Text accessibilityLiveRegion={error ? "polite" : "none"} style={{ color: error ? colors.error : colors.muted, fontSize: 13, lineHeight: 18, paddingHorizontal: 6 }}>
        {note}
      </Text>
    ) : null}
    </View>
  );
}

export function AuthMessage({ message, success = false }: { message?: string | null; success?: boolean }) {
  const { colors } = useAuthTheme();
  if (!message) return null;
  return (
    <Text
      selectable
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{ color: success ? colors.success : colors.error, fontSize: 14, lineHeight: 20, paddingHorizontal: 4 }}
    >
      {message}
    </Text>
  );
}

/** A quiet text action. `lead` is muted text before the action ("New here? Create an account"). */
export function AuthLink({
  title,
  lead,
  onPress,
  disabled,
  testID,
  align = "center",
}: {
  title: string;
  lead?: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
  align?: "center" | "end";
}) {
  const { colors } = useAuthTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={lead ? `${lead} ${title}` : title}
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({ minHeight: 44, alignSelf: align === "end" ? "flex-end" : "center", justifyContent: "center", opacity: disabled ? 0.4 : pressed ? 0.5 : 1 })}
    >
      <Text style={{ fontSize: 15, color: colors.secondary }}>
        {lead ? `${lead} ` : ""}
        <Text style={{ color: colors.text, fontWeight: "600" }}>{title}</Text>
      </Text>
    </Pressable>
  );
}

/** "or" between the one-tap providers and the email form. */
export function AuthDivider() {
  const { colors } = useAuthTheme();
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 4 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
      <Text style={{ color: colors.muted, fontSize: 13 }}>or</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
    </View>
  );
}
