import React from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { ChatIcon } from "./chat-icon";
import { VoiceWaveVisualizer } from "./voice-wave-visualizer";

export type VoiceDictationStatus = "listening" | "transcribing";

interface VoiceDictationBarProps {
  status: VoiceDictationStatus;
  transcript: string;
  audioLevel: number;
  colors: {
    foreground: string;
    background: string;
    muted: string;
    mutedForeground: string;
    border: string;
    primary: string;
    primaryForeground: string;
    composer: string;
  };
  onStop: () => void;
  onSend: () => void;
  onCancel: () => void;
}

export function VoiceDictationBar({
  status,
  audioLevel,
  colors,
  onStop,
  onSend,
  onCancel,
}: VoiceDictationBarProps) {
  const handleStop = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    onStop();
  };

  const handleSend = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    onSend();
  };

  const handleCancel = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    onCancel();
  };

  const isTranscribing = status === "transcribing";

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(140)}
      style={{
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        height: 52,
        paddingHorizontal: 6,
        gap: 8,
      }}
    >
      {/* Left Cancel (X) button */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancel voice recording"
        hitSlop={8}
        onPressIn={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        }}
        onPress={handleCancel}
        style={({ pressed }) => ({
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: colors.muted,
          alignItems: "center",
          justifyContent: "center",
          transform: [{ scale: pressed ? 0.94 : 1 }],
        })}
      >
        <ChatIcon name="close" color={colors.foreground} size={18} />
      </Pressable>

      {/* Center content: Waveform when listening, 'Transcribing' when processing */}
      <View
        style={{
          flex: 1,
          height: 36,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 4,
        }}
      >
        {isTranscribing ? (
          <Animated.View
            entering={FadeIn.duration(150)}
            style={{ alignItems: "center", justifyContent: "center" }}
          >
            <Text
              style={{
                fontFamily: "DMSans_500Medium",
                fontSize: 16,
                color: colors.mutedForeground,
                textAlign: "center",
                letterSpacing: -0.2,
              }}
            >
              Transcribing
            </Text>
          </Animated.View>
        ) : (
          <Animated.View
            entering={FadeIn.duration(150)}
            style={{ width: "100%", height: 36, justifyContent: "center" }}
          >
            <VoiceWaveVisualizer
              isActive
              audioLevel={audioLevel}
              color={colors.foreground}
              height={32}
            />
          </Animated.View>
        )}
      </View>

      {/* Right controls: Stop/Spinner button + Send button */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {/* Stop or Spinner button */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isTranscribing ? "Transcribing audio" : "Stop recording"}
          disabled={isTranscribing}
          hitSlop={6}
          onPress={handleStop}
          style={({ pressed }) => ({
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: colors.muted,
            alignItems: "center",
            justifyContent: "center",
            transform: [{ scale: pressed && !isTranscribing ? 0.94 : 1 }],
          })}
        >
          {isTranscribing ? (
            <ActivityIndicator size="small" color={colors.mutedForeground} />
          ) : (
            <View
              style={{
                width: 12,
                height: 12,
                borderRadius: 2.5,
                backgroundColor: colors.foreground,
              }}
            />
          )}
        </Pressable>

        {/* Send arrow button */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send message"
          hitSlop={6}
          onPress={handleSend}
          style={({ pressed }) => ({
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: colors.primary,
            alignItems: "center",
            justifyContent: "center",
            transform: [{ scale: pressed ? 0.94 : 1 }],
          })}
        >
          <ChatIcon name="arrowUp" color={colors.primaryForeground} size={18} />
        </Pressable>
      </View>
    </Animated.View>
  );
}
