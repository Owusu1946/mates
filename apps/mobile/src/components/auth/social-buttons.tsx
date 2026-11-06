import { useRef, useState } from "react";
import { useSSO } from "@clerk/expo";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { SocialIcon } from "./social-icon";
import { AuthGlass } from "./auth-glass";
import { AuthMessage } from "./auth-fields";
import { authLayout, useAuthTheme } from "../../theme/auth";
import { haptic } from "../../haptics";

type Provider = "apple" | "google";
const strategies = { apple: "oauth_apple", google: "oauth_google" } as const;
export function SocialAuthButtons({
  disabled = false,
  onPendingChange,
}: {
  disabled?: boolean;
  onPendingChange?: (pending: boolean) => void;
}) {
  const { startSSOFlow } = useSSO();
  const router = useRouter();
  const { colors } = useAuthTheme();
  const [pending, setPending] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  async function signIn(provider: Provider) {
    if (running.current || disabled) return;
    running.current = true;
    setPending(provider);
    setError(null);
    onPendingChange?.(true);
    haptic.light();
    try {
      const { createdSessionId, setActive, signUp } = await startSSOFlow({
        strategy: strategies[provider],
      });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        router.replace("/");
      } else if (signUp?.status === "missing_requirements") {
        setError(
          "Your account needs a few more details. Please create an account using email below.",
        );
      }
      // Closing the provider sheet without a session is a cancellation, not an error.
    } catch {
      setError(
        "We couldn’t connect just now. Try again, or continue with email.",
      );
      haptic.error();
    } finally {
      running.current = false;
      setPending(null);
      onPendingChange?.(false);
    }
  }
  const providers: Provider[] =
    Platform.OS === "ios" ? ["apple", "google"] : ["google", "apple"];
  return (
    <View style={{ gap: 12 }}>
      {providers.map((provider) => (
        <AuthGlass
          key={provider}
          interactive
          style={{ borderRadius: authLayout.controlRadius }}
        >
          <Pressable
            testID={`social-${provider}`}
            accessibilityRole="button"
            accessibilityLabel={`Continue with ${provider === "apple" ? "Apple" : "Google"}`}
            accessibilityState={{
              disabled: disabled || !!pending,
              busy: pending === provider,
            }}
            disabled={disabled || pending !== null}
            onPress={() => void signIn(provider)}
            style={({ pressed }) => ({
              minHeight: authLayout.buttonHeight,
              paddingHorizontal: authLayout.gap,
              paddingVertical: 14,
              flexDirection: "row",
              gap: 12,
              alignItems: "center",
              justifyContent: "center",
              opacity:
                disabled || (pending && pending !== provider)
                  ? 0.45
                  : pressed
                    ? 0.6
                    : 1,
            })}
          >
            {pending === provider ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <SocialIcon provider={provider} size={21} color={colors.text} />
            )}
            <Text
              style={{
                color: colors.text,
                fontSize: authLayout.textSize,
                fontWeight: "600",
              }}
            >
              {pending === provider
                ? "Connecting…"
                : `Continue with ${provider === "apple" ? "Apple" : "Google"}`}
            </Text>
          </Pressable>
        </AuthGlass>
      ))}
      <AuthMessage message={error} />
    </View>
  );
}
