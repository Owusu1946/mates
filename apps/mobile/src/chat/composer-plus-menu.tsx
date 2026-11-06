import React from "react";
import { View, Text, Pressable, StyleSheet, TouchableWithoutFeedback } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { GlassView } from "expo-glass-effect";
import { ChatIcon } from "./chat-icon";

export type PlusMenuOption = "camera" | "photos" | "files";

interface ComposerPlusMenuProps {
  isOpen: boolean;
  useGlass: boolean;
  colors: {
    foreground: string;
    background: string;
    muted: string;
    mutedForeground: string;
    border: string;
    composer: string;
  };
  onSelect: (option: PlusMenuOption) => void;
  onClose: () => void;
}

const MENU_ITEMS: { id: PlusMenuOption; label: string; icon: "camera" | "photos" | "files" }[] = [
  { id: "camera", label: "Camera", icon: "camera" },
  { id: "photos", label: "Photos", icon: "photos" },
  { id: "files", label: "Files", icon: "files" },
];

export function ComposerPlusMenu({
  isOpen,
  useGlass,
  colors,
  onSelect,
  onClose,
}: ComposerPlusMenuProps) {
  if (!isOpen) return null;

  const handleSelect = async (option: PlusMenuOption) => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    onSelect(option);
    onClose();
  };

  const containerStyle = {
    width: 210,
    borderRadius: 24,
    borderCurve: "continuous" as const,
    borderWidth: useGlass ? 0 : StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: useGlass ? "transparent" : colors.background,
    overflow: "hidden" as const,
    padding: 8,
    boxShadow: "0 16px 40px rgba(0, 0, 0, 0.12)",
  };

  return (
    <>
      {/* Invisible backdrop to dismiss menu on tap outside */}
      <TouchableWithoutFeedback onPress={onClose}>
        <View
          style={{
            position: "absolute",
            top: -1000,
            bottom: -1000,
            left: -1000,
            right: -1000,
            zIndex: 40,
          }}
        />
      </TouchableWithoutFeedback>

      {/* Floating Liquid Glass Menu */}
      <Animated.View
        entering={FadeIn.duration(180)}
        exiting={FadeOut.duration(120)}
        style={{
          position: "absolute",
          left: 4,
          bottom: 64,
          zIndex: 50,
        }}
      >
        {useGlass ? (
          <GlassView glassEffectStyle="regular" colorScheme="auto" style={containerStyle}>
            <MenuContent items={MENU_ITEMS} colors={colors} onSelect={handleSelect} />
          </GlassView>
        ) : (
          <View style={containerStyle}>
            <MenuContent items={MENU_ITEMS} colors={colors} onSelect={handleSelect} />
          </View>
        )}
      </Animated.View>
    </>
  );
}

function MenuContent({
  items,
  colors,
  onSelect,
}: {
  items: typeof MENU_ITEMS;
  colors: {
    foreground: string;
    muted: string;
    mutedForeground: string;
  };
  onSelect: (option: PlusMenuOption) => void;
}) {
  return (
    <View style={{ gap: 4 }}>
      {items.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityLabel={item.label}
          onPress={() => onSelect(item.id)}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            paddingVertical: 8,
            paddingHorizontal: 8,
            borderRadius: 16,
            backgroundColor: pressed ? colors.muted : "transparent",
            transform: [{ scale: pressed ? 0.98 : 1 }],
          })}
        >
          {/* Circular icon pill */}
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: colors.muted,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ChatIcon name={item.icon} color={colors.foreground} size={20} />
          </View>

          {/* Option label */}
          <Text
            style={{
              fontFamily: "DMSans_500Medium",
              fontSize: 16,
              color: colors.foreground,
              letterSpacing: -0.2,
            }}
          >
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
