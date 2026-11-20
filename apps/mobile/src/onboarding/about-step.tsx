import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useToast } from "../components/toast";
import { LiquidGlassButton } from "../components/ui/liquid-glass-button";
import { haptic } from "../haptics";
import type { Gradient } from "../mates/data";
import { MateAvatar } from "../mates/mate-avatar";
import { useTheme } from "../theme/provider";
import { useMyName, useSetMyName } from "../friends/data";
import { useSaveAbout } from "./about-data";
import { AboutField } from "./about-field";

/**
 * The second step of setup: tell the new lead mate about yourself, typed or spoken. Skippable,
 * since the mates also learn as you chat, and never a dead end: if saving fails you can retry or
 * carry on.
 */
export function AboutStep({ mate, onDone }: { mate: { name: string; gradient: Gradient; shape?: string }; onDone: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const save = useSaveAbout();
  const toast = useToast();
  const [bio, setBio] = useState("");
  const ready = bio.trim().length >= 3;
  // The name friends know you by; sign-up never asks, so it's asked here (pre-filled from Apple or Google).
  const myName = useMyName();
  const setMyName = useSetMyName();
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched && myName.data) setName(myName.data.name ?? myName.data.suggestion ?? "");
  }, [myName.data, touched]);
  const saveName = () => {
    const value = name.trim();
    if (value && value !== myName.data?.name) setMyName.mutate(value);
  };

  const next = () => {
    if (!ready || save.isPending) return;
    saveName();
    save.mutate({ bio: bio.trim(), wait: true }, {
      onSuccess: () => {
        haptic.success();
        toast.show({ message: `Saved. ${mate.name} will keep this in mind.`, tone: "success" });
        onDone();
      },
    });
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20, paddingHorizontal: 24, gap: 24 }}>
        <View style={{ alignItems: "center", gap: 14 }}>
          <MateAvatar gradient={mate.gradient} shape={mate.shape} size={84} still />
          <View style={{ alignItems: "center", gap: 6 }}>
            <Text style={{ color: colors.text, fontFamily: "DMSans_600SemiBold", fontSize: 22, textAlign: "center" }}>Tell {mate.name} about yourself</Text>
            <Text style={{ color: colors.textMuted, fontFamily: "DMSans_400Regular", fontSize: 15, lineHeight: 21, textAlign: "center" }}>
              The more {mate.name} knows, the more {mate.name} can do for you. Your other mates get the parts that matter to them.
            </Text>
          </View>
        </View>

        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.textMuted, fontFamily: "DMSans_500Medium", fontSize: 13.5 }}>What should friends call you?</Text>
          <TextInput
            value={name}
            onChangeText={(text) => { setTouched(true); setName(text); }}
            placeholder="Your first name"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="words"
            autoComplete="given-name"
            textContentType="givenName"
            maxLength={40}
            style={{ height: 48, paddingHorizontal: 14, borderRadius: 14, backgroundColor: colors.surface, color: colors.text, fontFamily: "DMSans_400Regular", fontSize: 16 }}
          />
        </View>

        <AboutField value={bio} onChange={setBio} mateName={mate.name} />

        <View style={{ flex: 1 }} />
        {save.isPending && (
          <Text accessibilityLiveRegion="polite" style={{ color: colors.textMuted, fontFamily: "DMSans_400Regular", fontSize: 14, textAlign: "center" }}>
            {mate.name} is reading this…
          </Text>
        )}
        {save.error && (
          <View style={{ gap: 6, alignItems: "center" }}>
            <Text style={{ color: colors.error, fontSize: 14, textAlign: "center" }}>{save.error.message}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: "center" }}>You can also skip and add this later in Memory.</Text>
          </View>
        )}
        <LiquidGlassButton accessibilityLabel="Continue" size={52} tintColor={colors.text} style={{ width: "100%" }} disabled={!ready || save.isPending} onPress={next}>
          {save.isPending ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={{ color: colors.background, fontFamily: "DMSans_600SemiBold", fontSize: 17, opacity: ready ? 1 : 0.5 }}>{save.error ? "Try again" : "Continue"}</Text>
          )}
        </LiquidGlassButton>
        <Pressable accessibilityRole="button" accessibilityHint={`${mate.name} will learn about you as you chat`} onPress={() => { saveName(); onDone(); }} disabled={save.isPending} style={({ pressed }) => ({ alignSelf: "center", padding: 8, opacity: pressed ? 0.5 : 1 })}>
          <Text style={{ color: colors.textMuted, fontFamily: "DMSans_500Medium", fontSize: 15 }}>Skip for now</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
