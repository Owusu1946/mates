import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  withDelay,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { authLayout, useAuthTheme } from "../../theme/auth";

const EASE = Easing.bezier(0.77, 0, 0.175, 1);

export function CooperMark({ compact }: { compact: boolean }) {
  const { colors } = useAuthTheme();
  const size = compact ? authLayout.smallMarkSize : authLayout.markSize;
  const reducedMotion = useReducedMotion();
  const leftEye = useSharedValue(1);
  const rightEye = useSharedValue(1);
  const gaze = useSharedValue(0);
  const tilt = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (reducedMotion) return;
    let active = AppState.currentState === "active";
    let disposed = false;

    const blink = (wink = false, double = false) => {
      const motion = () => withSequence(
        withTiming(0.12, { duration: 70, easing: EASE }),
        withTiming(1, { duration: 105, easing: EASE }),
        ...(double ? [
          withDelay(140, withTiming(0.12, { duration: 65, easing: EASE })),
          withTiming(1, { duration: 110, easing: EASE }),
        ] : []),
      );
      leftEye.set(motion());
      if (!wink) rightEye.set(motion());
    };

    const schedule = (delay: number) => {
      if (!active || disposed) return;
      timer.current = setTimeout(() => {
        const moment = Math.random();
        if (moment < 0.72) {
          blink(false, moment < 0.12);
        } else if (moment < 0.92) {
          const direction = Math.random() < 0.5 ? -1 : 1;
          gaze.set(
            withSequence(
              withTiming(direction * (compact ? 1 : 2), {
                duration: 180,
                easing: EASE,
              }),
              withDelay(550, withTiming(0, { duration: 240, easing: EASE })),
            ),
          );
          tilt.set(
            withSequence(
              withTiming(direction * 4, { duration: 180, easing: EASE }),
              withDelay(550, withTiming(0, { duration: 240, easing: EASE })),
            ),
          );
        } else {
          blink(true);
        }
        schedule(1700 + Math.random() * 1400);
      }, delay);
    };

    schedule(700);
    const subscription = AppState.addEventListener("change", (state) => {
      active = state === "active";
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      if (active) schedule(1000);
    });
    return () => {
      disposed = true;
      subscription.remove();
      if (timer.current) clearTimeout(timer.current);
      cancelAnimation(leftEye);
      cancelAnimation(rightEye);
      cancelAnimation(gaze);
      cancelAnimation(tilt);
    };
  }, [compact, gaze, leftEye, reducedMotion, rightEye, tilt]);

  const faceStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${tilt.get()}deg` }],
  }));
  const leftStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: gaze.get() }, { scaleY: leftEye.get() }],
  }));
  const rightStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: gaze.get() }, { scaleY: rightEye.get() }],
  }));
  const eyeBase = {
    position: "absolute" as const,
    top: "40%" as const,
    width: "8%" as const,
    height: "20%" as const,
    borderRadius: size * 0.04,
    backgroundColor: colors.eye,
  };

  return (
    <Animated.View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width: size, height: size }, faceStyle]}
    >
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="cooper" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.peachLight} />
            <Stop offset="0.6" stopColor={colors.peach} />
            <Stop offset="1" stopColor={colors.peachDark} />
          </LinearGradient>
        </Defs>
        <Rect x="8" y="12" width="84" height="76" rx="32" fill="url(#cooper)" />
      </Svg>
      <Animated.View style={[eyeBase, { left: "34%" }, leftStyle]} />
      <Animated.View style={[eyeBase, { left: "58%" }, rightStyle]} />
    </Animated.View>
  );
}
