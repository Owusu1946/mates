import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { Platform, Pressable, Text, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { FadeInDown, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FullWindowOverlay } from "react-native-screens";
import { ChatIcon } from "../chat/chat-icon";
import { useTheme } from "../theme/provider";

type ToastOptions = { message: string; tone?: "success" | "error" | "info"; duration?: number };
type ToastState = ToastOptions & { id: number };

type ToastContextValue = { show: (options: ToastOptions) => void; dismiss: () => void };
const ToastContext = createContext<ToastContextValue | null>(null);

/** One app-wide toast, rendered over native iOS sheets as well as ordinary screens. */
export function ToastProvider({ children }: PropsWithChildren) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const show = useCallback((options: ToastOptions) => setToast({ ...options, id: Date.now() }), []);
  const dismiss = useCallback(() => setToast(null), []);
  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (Platform.OS === "ios" ? <FullWindowOverlay><Toast key={toast.id} toast={toast} onDismiss={() => setToast((current) => current?.id === toast.id ? null : current)} /></FullWindowOverlay> : <Toast key={toast.id} toast={toast} onDismiss={() => setToast((current) => current?.id === toast.id ? null : current)} />)}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}

export function Toast({ toast, onDismiss }: { toast: ToastState | null; onDismiss: () => void }) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const translateX = useSharedValue(0);
  const { width } = useWindowDimensions();

  useEffect(() => {
    if (!toast) return;
    translateX.set(0);
    const timer = setTimeout(onDismiss, toast.duration ?? 4000);
    return () => clearTimeout(timer);
  }, [toast, onDismiss, translateX]);

  const gesture = Gesture.Pan().activeOffsetX([-12, 12]).onUpdate((event) => {
    translateX.set(event.translationX);
  }).onEnd((event) => {
    if (Math.abs(event.translationX) > 80 || Math.abs(event.velocityX) > 800) {
      const direction = Math.abs(event.velocityX) > 800 ? Math.sign(event.velocityX) : Math.sign(event.translationX);
      translateX.set(withTiming(direction * width, { duration: reducedMotion ? 0 : 160 }, (finished) => {
        if (finished) runOnJS(onDismiss)();
      }));
    } else translateX.set(withSpring(0));
  });
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.get() }] }));
  if (!toast) return null;
  const success = toast.tone === "success";
  const background = isDark ? (success ? "#18332B" : "#173039") : (success ? "#EAF6EF" : "#EAF6F8");
  const border = isDark ? (success ? "#2C483E" : "#28444A") : (success ? "#D7EDE0" : "#D7EAED");
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 16, right: 16, bottom: Math.max(insets.bottom, 16) + 8 }}>
      <GestureDetector gesture={gesture}>
        <Animated.View entering={reducedMotion ? undefined : FadeInDown.duration(180)} style={[{ minHeight: 62, flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 16, paddingVertical: 16, borderRadius: 14, borderCurve: "continuous", backgroundColor: background, borderWidth: 1, borderColor: border, boxShadow: isDark ? "0px 4px 16px rgba(0, 0, 0, 0.24)" : "0px 4px 16px rgba(15, 23, 42, 0.08)" }, animatedStyle]}>
          <Text accessibilityLiveRegion="polite" style={{ flex: 1, color: colors.text, fontFamily: "DMSans_500Medium", fontSize: 14, lineHeight: 20 }}>{toast.message}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss notification" hitSlop={12} onPress={onDismiss}>
            <ChatIcon name="close" size={16} color={colors.textSecondary} />
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
