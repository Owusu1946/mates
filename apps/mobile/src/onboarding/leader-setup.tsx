import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChatIcon } from "../chat/chat-icon";
import { SHAPE_NAMES, type PolygonState } from "../components/polygon-avatar/polygon-avatar-core";
import { LiquidGlassButton } from "../components/ui/liquid-glass-button";
import { haptic } from "../haptics";
import { useMateActions, type Mate, type Presets } from "../mates/data";
import { MateAvatar } from "../mates/mate-avatar";
import { NAME_PATTERN } from "../mates/mate-form";
import { useTheme } from "../theme/provider";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const FALLBACK_DAY_NAMES = ["Kwesi", "Kojo", "Kwabena", "Kweku", "Yaw", "Kofi", "Kwame"];

/**
 * Right after sign-up: the user names their lead mate (today's Akan day name to start, a dice
 * for the other six, or their own), picks a shape and a colour, and watches it react.
 */
export function LeaderSetup({ leader, presets, onDone }: { leader: Mate; presets: Presets; onDone: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { setupLeader } = useMateActions();
  const dayNames = presets.dayNames?.length === 7 ? presets.dayNames : FALLBACK_DAY_NAMES;
  const today = new Date().getDay();
  const shapes = SHAPE_NAMES.filter((s) => !presets.shapes || presets.shapes.includes(s));

  const [name, setName] = useState(dayNames[today]!);
  const [shape, setShape] = useState(leader.shape ?? "hexagon");
  const [color, setColor] = useState(leader.color);
  const gradient = presets.palette.find((p) => p.key === color)?.gradient ?? leader.gradient;

  const trimmed = name.trim();
  const day = dayNames.findIndex((n) => n.toLowerCase() === trimmed.toLowerCase());
  const nameProblem = trimmed && !NAME_PATTERN.test(trimmed) ? "Use letters, numbers and spaces only." : null;
  const valid = trimmed.length > 0 && !nameProblem;

  // The mascot cheers and gives a little hop whenever something about it changes.
  const [mood, setMood] = useState<PolygonState>("idle");
  const hop = useSharedValue(1);
  const moodTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const react = () => {
    haptic.selection();
    hop.value = withSequence(withTiming(1.08, { duration: 120 }), withSpring(1, { damping: 8, stiffness: 220 }));
    setMood("happy");
    clearTimeout(moodTimer.current);
    moodTimer.current = setTimeout(() => setMood("idle"), 1200);
  };
  useEffect(() => () => clearTimeout(moodTimer.current), []);
  const hopStyle = useAnimatedStyle(() => ({ transform: [{ scale: hop.value }] }));

  const shuffle = () => {
    setName(dayNames[((day < 0 ? today : day) + 1) % 7]!);
    react();
  };
  const create = () => {
    if (!valid || setupLeader.isPending) return;
    setupLeader.mutate(
      { name: trimmed, shape, color },
      {
        onSuccess: () => {
          haptic.success();
          onDone();
        },
      },
    );
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20, paddingHorizontal: 24, gap: 28 }}
      >
        <View style={{ alignItems: "center", gap: 6 }}>
          <Text style={{ color: colors.text, fontFamily: "DMSans_600SemiBold", fontSize: 22 }}>Meet your lead mate</Text>
          <Text style={{ color: colors.textMuted, fontFamily: "DMSans_400Regular", fontSize: 15, textAlign: "center" }}>
            They lead your team. You can change this later.
          </Text>
        </View>

        <Animated.View style={[{ alignItems: "center" }, hopStyle]}>
          <MateAvatar gradient={gradient} shape={shape} size={150} state={mood} />
        </Animated.View>

        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", borderRadius: 16, backgroundColor: colors.surfaceElevated, paddingLeft: 48 }}>
            <TextInput
              value={name}
              onChangeText={setName}
              onEndEditing={() => trimmed && react()}
              maxLength={24}
              autoCorrect={false}
              returnKeyType="done"
              accessibilityLabel="Your lead mate's name"
              style={{ flex: 1, color: colors.text, fontFamily: "DMSans_600SemiBold", fontSize: 18, textAlign: "center", paddingVertical: 14 }}
            />
            <Pressable accessibilityRole="button" accessibilityLabel="Try another day name" hitSlop={8} onPress={shuffle} style={{ width: 48, alignItems: "center", justifyContent: "center", alignSelf: "stretch" }}>
              <ChatIcon name="shuffle" color={colors.textMuted} size={22} />
            </Pressable>
          </View>
          <Text style={{ color: nameProblem ? colors.error : colors.textMuted, fontFamily: "DMSans_400Regular", fontSize: 13, textAlign: "center" }}>
            {nameProblem ?? (day >= 0 ? `Born on a ${WEEKDAYS[day]}` : "Your own name")}
          </Text>
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10 }}>
          {shapes.map((key) => {
            const on = key === shape;
            return (
              <Pressable
                key={key}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={key}
                onPress={() => {
                  setShape(key);
                  react();
                }}
                style={{ width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: on ? colors.surfaceElevated : "transparent" }}
              >
                <MateAvatar gradient={gradient} shape={key} size={38} still />
              </Pressable>
            );
          })}
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 12 }}>
          {presets.palette.map((option) => {
            const on = option.key === color;
            return (
              <Pressable
                key={option.key}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={option.key}
                onPress={() => {
                  setColor(option.key);
                  react();
                }}
                style={{ width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: on ? colors.text : "transparent" }}
              >
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: option.gradient[1] }} />
              </Pressable>
            );
          })}
        </View>

        <View style={{ flex: 1 }} />
        {setupLeader.error && <Text style={{ color: colors.error, fontSize: 14, textAlign: "center" }}>{setupLeader.error.message}</Text>}
        <LiquidGlassButton accessibilityLabel="Create" size={52} tintColor={colors.text} style={{ width: "100%" }} disabled={!valid || setupLeader.isPending} onPress={create}>
          {setupLeader.isPending ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={{ color: colors.background, fontFamily: "DMSans_600SemiBold", fontSize: 17, opacity: valid ? 1 : 0.5 }}>Create</Text>
          )}
        </LiquidGlassButton>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
