import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useToast } from "../components/toast";
import { haptic } from "../haptics";
import { font } from "../memory/memory-ui";
import { useTheme } from "../theme/provider";
import { useMyName, useSetMyName } from "./data";

/**
 * "What should friends call you?": the one name friends and their mates see, and what they say to
 * reach you ("ask Kwame's mate…"). Pre-filled from Apple or Google sign-in when there's one.
 */
export function NameField({ onSaved, compact }: { onSaved?: (name: string) => void; compact?: boolean }) {
  const { colors } = useTheme();
  const toast = useToast();
  const current = useMyName();
  const save = useSetMyName();
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched && current.data) setName(current.data.name ?? current.data.suggestion ?? "");
  }, [current.data, touched]);
  const value = name.trim();
  const unchanged = value === (current.data?.name ?? "");

  const submit = () => {
    if (!value || save.isPending) return;
    save.mutate(value, {
      onSuccess: (data) => { haptic.success(); onSaved?.(data.name ?? value); },
      onError: (error) => toast.show({ message: error.message, tone: "error" }),
    });
  };

  return (
    <View style={{ gap: 10 }}>
      {!compact && (
        <View style={{ gap: 4 }}>
          <Text style={{ color: colors.text, fontFamily: font.semibold, fontSize: 17 }}>What should friends call you?</Text>
          <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 14, lineHeight: 20 }}>
            It’s what your friends see, and what they say to reach you: “ask {value || "Kwame"}’s mate…”.
          </Text>
        </View>
      )}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <TextInput
          value={name}
          onChangeText={(text) => { setTouched(true); setName(text); }}
          placeholder="Your first name"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="words"
          autoComplete="given-name"
          textContentType="givenName"
          returnKeyType="done"
          maxLength={40}
          onSubmitEditing={submit}
          style={{ flex: 1, height: 48, paddingHorizontal: 14, borderRadius: 14, backgroundColor: colors.surface, color: colors.text, fontFamily: font.regular, fontSize: 16 }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save your name"
          disabled={!value || unchanged || save.isPending}
          onPress={submit}
          style={({ pressed }) => ({ height: 48, paddingHorizontal: 18, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.text, opacity: !value || unchanged || save.isPending ? 0.35 : pressed ? 0.8 : 1 })}
        >
          <Text style={{ color: colors.background, fontFamily: font.semibold, fontSize: 15 }}>{save.isPending ? "Saving…" : "Save"}</Text>
        </Pressable>
      </View>
    </View>
  );
}
