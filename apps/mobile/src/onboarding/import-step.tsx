import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChatIcon } from "../chat/chat-icon";
import { LiquidGlassButton } from "../components/ui/liquid-glass-button";
import type { Gradient } from "../mates/data";
import { MateAvatar } from "../mates/mate-avatar";
import { AssistantLogo } from "../memory/assistant-logos";
import { ImportFlow, SourcePicker } from "../memory/import-flow";
import type { ImportSource } from "../memory/import-prompts";
import { useTheme } from "../theme/provider";

const MARKS: ImportSource[] = ["chatgpt", "claude", "gemini", "grok"];

/**
 * The last step of setup: bring what ChatGPT, Claude, Gemini or Grok knows, so the new mate
 * doesn't start from zero. Always skippable; the same import lives in Settings → Memory.
 */
export function ImportStep({ mate, onDone }: { mate: { name: string; gradient: Gradient; shape?: string }; onDone: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [source, setSource] = useState<ImportSource | null>(null);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20, paddingHorizontal: 24, gap: 28 }}
      >
        {source ? (
          <Animated.View entering={FadeIn.duration(220)} style={{ gap: 20 }}>
            <ImportFlow
              source={source}
              onBack={() => setSource(null)}
              done={() => (
                <LiquidGlassButton accessibilityLabel="Continue" size={52} tintColor={colors.text} style={{ width: "100%", marginTop: 12 }} onPress={onDone}>
                  <Text style={{ color: colors.background, fontFamily: "DMSans_600SemiBold", fontSize: 17 }}>Continue</Text>
                </LiquidGlassButton>
              )}
            />
          </Animated.View>
        ) : (
          <>
            <Animated.View entering={FadeIn.duration(300)} style={{ alignItems: "center", gap: 20 }}>
              {/* Their old assistants, flowing into the new mate. */}
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <View style={{ flexDirection: "row" }}>
                  {MARKS.map((mark, i) => (
                    <View
                      key={mark}
                      style={{ width: 44, height: 44, marginLeft: i ? -10 : 0, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.background }}
                    >
                      <AssistantLogo source={mark} size={22} />
                    </View>
                  ))}
                </View>
                <ChatIcon name="next" color={colors.textMuted} size={18} />
                <MateAvatar gradient={mate.gradient} shape={mate.shape} size={64} still />
              </View>
              <View style={{ alignItems: "center", gap: 8 }}>
                <Text style={{ color: colors.text, fontFamily: "DMSans_600SemiBold", fontSize: 24, textAlign: "center" }}>Coming from another AI?</Text>
                <Text style={{ color: colors.textMuted, fontFamily: "DMSans_400Regular", fontSize: 15, lineHeight: 21, textAlign: "center", maxWidth: 320 }}>
                  Bring what it knows about you, so {mate.name} doesn’t start from zero. It takes about a minute, and you choose what comes over.
                </Text>
              </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(120).duration(360)}>
              <SourcePicker layout="grid" onPick={setSource} />
            </Animated.View>

            <View style={{ flex: 1 }} />
            <View style={{ alignItems: "center", gap: 6 }}>
              <Pressable accessibilityRole="button" accessibilityHint="You can import later in Settings, Memory" onPress={onDone} style={({ pressed }) => ({ paddingHorizontal: 16, paddingVertical: 8, opacity: pressed ? 0.5 : 1 })}>
                <Text style={{ color: colors.text, fontFamily: "DMSans_500Medium", fontSize: 16 }}>Skip for now</Text>
              </Pressable>
              <Text style={{ color: colors.textMuted, fontFamily: "DMSans_400Regular", fontSize: 13 }}>You can do this anytime in Settings → Memory.</Text>
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
