import { type PropsWithChildren } from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChatIcon } from "../../chat/chat-icon";
import { Glow } from "../../onboarding/glow";
import { authLayout, useAuthTheme } from "../../theme/auth";
import { PolygonAvatar } from "../polygon-avatar/polygon-avatar";
import { DEFAULT_GRADIENT } from "../polygon-avatar/polygon-avatar-core";
import { LiquidGlassButton } from "../ui/liquid-glass-button";

const HERO = 150;

/**
 * Every auth screen. `hero` is the welcome: Cooper centred above the title, actions at the
 * bottom. Otherwise a step: a glass back button, a left-aligned title, and the form under it.
 */
export function AuthLayout({
  children,
  title,
  subtitle,
  hero = false,
  onBack,
  testID,
  footer,
}: PropsWithChildren<{
  title: string;
  subtitle: string;
  hero?: boolean;
  onBack?: () => void;
  testID?: string;
  footer?: React.ReactNode;
}>) {
  const { colors } = useAuthTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      testID={testID}
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        flexGrow: 1,
        paddingTop: insets.top + authLayout.smallGap,
        paddingBottom: insets.bottom + authLayout.gap,
        paddingHorizontal: authLayout.edge,
      }}
      contentInsetAdjustmentBehavior="never"
      automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    >
      <View style={{ width: "100%", alignSelf: "center", maxWidth: authLayout.maxWidth, flexGrow: 1 }}>
        <View style={{ height: 48, justifyContent: "center", marginLeft: -4 }}>
          {onBack && (
            <LiquidGlassButton accessibilityLabel="Back" onPress={onBack} size={44}>
              <ChatIcon name="previous" color={colors.text} size={22} />
            </LiquidGlassButton>
          )}
        </View>
        {hero ? (
          <View style={{ flexGrow: 1, justifyContent: "center", alignItems: "center", gap: 28, paddingVertical: 24 }}>
            <View style={{ width: HERO, height: HERO, alignItems: "center", justifyContent: "center" }}>
              <Glow color={DEFAULT_GRADIENT[1]} size={HERO * 2.2} style={{ left: -HERO * 0.6, top: -HERO * 0.6 }} />
              <PolygonAvatar size={HERO} state="happy" title={null} />
            </View>
            <View style={{ gap: 10, alignItems: "center" }}>
              <Text accessibilityRole="header" style={{ fontSize: authLayout.titleSize, lineHeight: 46, letterSpacing: -1.5, fontWeight: "600", textAlign: "center", color: colors.text }}>
                {title}
              </Text>
              <Text style={{ fontSize: 17, lineHeight: 25, color: colors.secondary, textAlign: "center", maxWidth: 300 }}>{subtitle}</Text>
            </View>
          </View>
        ) : (
          // Keyed by title so each step eases in rather than snapping.
          <Animated.View key={title} entering={FadeIn.duration(220)} style={{ gap: 8, paddingTop: 20, paddingBottom: 28 }}>
            <Text accessibilityRole="header" style={{ fontSize: authLayout.compactTitleSize, lineHeight: 38, letterSpacing: -1.2, fontWeight: "600", color: colors.text }}>
              {title}
            </Text>
            <Text style={{ fontSize: 16, lineHeight: 23, color: colors.secondary }}>{subtitle}</Text>
          </Animated.View>
        )}
        <View style={{ gap: authLayout.gap }}>{children}</View>
        {!hero && <View style={{ flexGrow: 1 }} />}
        {footer && <View style={{ paddingTop: authLayout.gap }}>{footer}</View>}
      </View>
    </ScrollView>
  );
}
