import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { LiquidGlassButton } from "../components/ui/liquid-glass-button";
import { useTheme } from "../theme/provider";
import type { MateInput, Presets } from "./data";
import { MateAvatar } from "./mate-avatar";

export const NAME_PATTERN = /^[\p{L}\p{N} .'_-]+$/u;

/** Create or edit a mate: name, colour (with a live preview) and role. */
export function MateForm({
  presets,
  initial,
  submitLabel,
  submitting,
  error,
  onSubmit,
}: {
  presets: Presets;
  initial?: Partial<MateInput>;
  submitLabel: string;
  submitting: boolean;
  error?: string | null;
  onSubmit: (input: MateInput) => void;
}) {
  const { colors } = useTheme();
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? presets.palette[1]?.key ?? "teal");
  const [role, setRole] = useState(initial?.role ?? "companion");
  const brief = (key: string) => presets.roles.find((r) => r.key === key)?.brief ?? "";
  const [description, setDescription] = useState(initial?.roleDescription || brief(initial?.role ?? "companion"));
  const gradient = presets.palette.find((p) => p.key === color)?.gradient;
  const trimmed = name.trim();
  const nameProblem = trimmed && !NAME_PATTERN.test(trimmed) ? "Use letters, numbers and spaces only." : null;
  const valid = trimmed.length > 0 && trimmed.length <= 40 && !nameProblem;

  const label = { color: colors.textMuted, fontSize: 13, fontFamily: "DMSans_600SemiBold", marginBottom: 8 } as const;
  const field = { color: colors.text, fontSize: 16, fontFamily: "DMSans_400Regular", borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12 } as const;

  return (
    <View style={{ gap: 22 }}>
      <View style={{ alignItems: "center" }}>
        <MateAvatar gradient={gradient} size={112} state="happy" />
      </View>
      <View>
        <Text style={label}>Name</Text>
        <TextInput value={name} onChangeText={setName} placeholder="e.g. Scout" placeholderTextColor={colors.textMuted} maxLength={40} autoCapitalize="words" accessibilityLabel="Mate name" style={field} />
        {nameProblem && <Text style={{ color: colors.error, fontSize: 13, marginTop: 6 }}>{nameProblem}</Text>}
      </View>
      <View>
        <Text style={label}>Colour</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {presets.palette.map((swatch) => {
            const on = swatch.key === color;
            return (
              <Pressable
                key={swatch.key}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={swatch.key}
                onPress={() => setColor(swatch.key)}
                style={{ width: 40, height: 40, borderRadius: 20, padding: 3, borderWidth: 2, borderColor: on ? colors.text : "transparent" }}
              >
                <View style={{ flex: 1, borderRadius: 17, overflow: "hidden", flexDirection: "row" }}>
                  {swatch.gradient.map((stop) => <View key={stop} style={{ flex: 1, backgroundColor: stop }} />)}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View>
        <Text style={label}>Role</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {presets.roles.map((preset) => {
            const on = preset.key === role;
            return (
              <Pressable
                key={preset.key}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => {
                  setRole(preset.key);
                  // Presets fill the description; a custom role keeps what the user wrote.
                  if (preset.key !== "custom") setDescription(preset.brief);
                }}
                style={{ paddingHorizontal: 14, height: 36, borderRadius: 18, justifyContent: "center", backgroundColor: on ? colors.text : colors.surface, borderWidth: 1, borderColor: on ? colors.text : colors.border }}
              >
                <Text style={{ color: on ? colors.background : colors.text, fontFamily: "DMSans_500Medium", fontSize: 14 }}>{preset.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="What is this mate like, and what do they help with?"
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={600}
          accessibilityLabel="Role description"
          style={[field, { marginTop: 12, minHeight: 88, textAlignVertical: "top" }]}
        />
      </View>
      {error && <Text style={{ color: colors.error, fontSize: 14 }}>{error}</Text>}
      <LiquidGlassButton
        accessibilityLabel={submitLabel}
        size={52}
        tintColor={colors.text}
        style={{ width: "100%" }}
        disabled={!valid || submitting}
        onPress={() => onSubmit({ name: trimmed, color, role, roleDescription: description.trim() })}
      >
        {submitting ? <ActivityIndicator color={colors.background} /> : <Text style={{ color: colors.background, fontFamily: "DMSans_600SemiBold", fontSize: 17, opacity: valid ? 1 : 0.5 }}>{submitLabel}</Text>}
      </LiquidGlassButton>
    </View>
  );
}
