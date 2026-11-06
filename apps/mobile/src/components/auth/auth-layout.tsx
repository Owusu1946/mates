import { type PropsWithChildren } from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { authLayout, useAuthTheme } from "../../theme/auth";
import { AuthGlass } from "./auth-glass";
import { CooperMark } from "./cooper-mark";

export function AuthLayout({
  children,
  title,
  subtitle,
  compact = false,
  testID,
  footer,
}: PropsWithChildren<{
  title: string;
  subtitle: string;
  compact?: boolean;
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
      <View
        style={{ width: "100%", alignSelf: "center", maxWidth: authLayout.maxWidth, flexGrow: 1 }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "flex-start",
            gap: authLayout.smallGap,
            paddingVertical: authLayout.smallGap,
          }}
        >
          <Text
            style={{
              fontSize: 23,
              letterSpacing: -0.8,
              fontWeight: "600",
              color: colors.text,
            }}
          >
            cooper
          </Text>
          <View
            style={{
              width: 5,
              height: 5,
              borderRadius: 3,
              backgroundColor: colors.accent,
            }}
          />
        </View>
        <View
          style={{
            flexGrow: compact ? 0 : 1,
            justifyContent: "center",
            alignItems: "center",
            paddingTop: compact ? 24 : 40,
            paddingBottom: compact ? 24 : authLayout.sectionGap,
            gap: authLayout.gap,
          }}
        >
          <CooperMark compact={compact} />
          <View style={{ gap: authLayout.smallGap, alignItems: "center" }}>
            <Text
              accessibilityRole="header"
              style={{
                fontSize: compact
                  ? authLayout.compactTitleSize
                  : authLayout.titleSize,
                lineHeight: compact ? 38 : 46,
                letterSpacing: -1.5,
                fontWeight: "600",
                textAlign: "center",
                color: colors.text,
              }}
            >
              {title}
            </Text>
            <Text
              style={{
                fontSize: authLayout.bodySize,
                lineHeight: 24,
                color: colors.secondary,
                textAlign: "center",
                maxWidth: 300,
              }}
            >
              {subtitle}
            </Text>
          </View>
          {!compact && (
            <AuthGlass
              style={{
                borderRadius: 24,
                paddingHorizontal: 16,
                paddingVertical: 10,
              }}
            >
              <Text
                style={{
                  fontSize: authLayout.captionSize,
                  color: colors.secondary,
                }}
              >
                A clearer head. A little more time.
              </Text>
            </AuthGlass>
          )}
        </View>
        <View style={{ gap: authLayout.gap }}>{children}</View>
        {footer && <View style={{ paddingTop: authLayout.gap }}>{footer}</View>}
      </View>
    </ScrollView>
  );
}
