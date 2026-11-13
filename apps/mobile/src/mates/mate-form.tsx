import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { LiquidGlassButton } from "../components/ui/liquid-glass-button";
import { ChatIcon } from "../chat/chat-icon";
import { haptic } from "../haptics";
import { useTheme } from "../theme/provider";
import type { MateInput, Presets } from "./data";
import { MateAvatar } from "./mate-avatar";

export const NAME_PATTERN = /^[\p{L}\p{N} .'_-]+$/u;

const SHAPES = [
  { key: "hexagon", label: "Hexagon" },
  { key: "circle", label: "Circle" },
  { key: "triangle", label: "Triangle" },
  { key: "oval", label: "Oval" },
  { key: "squircle", label: "Rounded square" },
  { key: "pill", label: "Pill" },
  { key: "cloud", label: "Cloud" },
  { key: "teardrop", label: "Teardrop" },
  { key: "pebble", label: "Pebble" },
];

/** Create or edit a mate: name, colour and shape (with a live preview) and role. */
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
  const shapes = SHAPES.filter((s) => !presets.shapes || presets.shapes.includes(s.key));
  const [shape, setShape] = useState(initial?.shape ?? shapes[0]?.key ?? "hexagon");
  const brief = (key: string) => presets.roles.find((r) => r.key === key)?.brief ?? "";
  const [description, setDescription] = useState(initial?.roleDescription || brief(initial?.role ?? "companion"));
  const gradient = presets.palette.find((p) => p.key === color)?.gradient;
  const trimmed = name.trim();
  const nameProblem = trimmed && !NAME_PATTERN.test(trimmed) ? "Use letters, numbers and spaces only." : null;
  const valid = trimmed.length > 0 && trimmed.length <= 40 && !nameProblem;
  const surpriseShape = () => {
    const choices = shapes.filter((option) => option.key !== shape);
    if (!choices.length) return;
    haptic.selection();
    setShape(choices[Math.floor(Math.random() * choices.length)]!.key);
  };

  const label = { color: colors.textMuted, fontSize: 13, fontFamily: "DMSans_600SemiBold", marginBottom: 8 } as const;
  const field = { color: colors.text, fontSize: 16, fontFamily: "DMSans_400Regular", borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12 } as const;

  return (
    <View style={{ gap: 22 }}>
      <View style={{ alignItems: "center" }}>
        <MateAvatar gradient={gradient} shape={shape} size={112} state="happy" />
      </View>
      <View>
        <Text style={label}>Name</Text>
        <TextInput value={name} onChangeText={setName} placeholder="e.g. Scout" placeholderTextColor={colors.textMuted} maxLength={40} autoCapitalize="words" accessibilityLabel="Mate name" style={field} />
        {nameProblem && <Text style={{ color: colors.error, fontSize: 13, marginTop: 6 }}>{nameProblem}</Text>}
      </View>
      <View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <Text style={[label, { marginBottom: 0 }]}>Colour</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: "DMSans_500Medium", textTransform: "capitalize" }}>{color}</Text>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "nowrap", gap: 8 }}>
          {presets.palette.map((swatch) => {
            const on = swatch.key === color;
            return (
              <Pressable
                key={swatch.key}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={swatch.key}
                hitSlop={6}
                onPress={() => setColor(swatch.key)}
                style={{ width: 38, height: 38, borderRadius: 19, padding: 3, borderWidth: 2, borderColor: on ? colors.text : "transparent" }}
              >
                <View style={{ flex: 1, borderRadius: 13, overflow: "hidden", flexDirection: "row" }}>
                  {swatch.gradient.map((stop) => <View key={stop} style={{ flex: 1, backgroundColor: stop }} />)}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <Text style={[label, { marginBottom: 0 }]}>Shape</Text>
          {!initial && <Pressable accessibilityRole="button" accessibilityLabel="Choose a surprise shape" onPress={surpriseShape} hitSlop={8} style={({ pressed }) => ({ width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18, opacity: pressed ? 0.55 : 1 })}><ChatIcon name="shuffle" color={colors.textSecondary} size={20} /></Pressable>}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {shapes.map((option) => {
            const on = option.key === shape;
            return (
              <Pressable
                key={option.key}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={option.label}
                onPress={() => setShape(option.key)}
                style={{ width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: on ? colors.text : "transparent" }}
              >
                <MateAvatar gradient={gradient} shape={option.key} size={42} still />
              </Pressable>
            );
          })}
        </View>
      </View>
      <View>
        <Text style={label}>Role</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
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
                style={{ paddingHorizontal: 12, height: 33, borderRadius: 17, justifyContent: "center", backgroundColor: on ? colors.text : colors.surface, borderWidth: 1, borderColor: on ? colors.text : colors.border }}
              >
                <Text style={{ color: on ? colors.background : colors.text, fontFamily: "DMSans_500Medium", fontSize: 13 }}>{preset.label}</Text>
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
        onPress={() => onSubmit({ name: trimmed, color, role, roleDescription: description.trim(), shape })}
      >
        {submitting ? <ActivityIndicator color={colors.background} /> : <Text style={{ color: colors.background, fontFamily: "DMSans_600SemiBold", fontSize: 17, opacity: valid ? 1 : 0.5 }}>{submitLabel}</Text>}
      </LiquidGlassButton>
    </View>
  );
}
