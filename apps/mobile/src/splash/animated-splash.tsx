import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { StyleSheet, useColorScheme, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";

/**
 * The hand-off from the native splash: the same honeycomb in the same spot, which wakes up as
 * three mates (eyes open, a hop, a blink) and then parts to reveal the app. Plain views and one
 * SVG path per cell, driven on the UI thread, so it stays smooth while the app loads underneath.
 */

/** Matches `imageWidth` for expo-splash-screen in app.json, so the first frame lines up. */
export const SPLASH_SIZE = 200;
export const SPLASH_BACKGROUND = { light: "#ffffff", dark: "#09090b" };

// Geometry from brand/generate.mjs: cells laid out in a 200-unit box, drawn into the
// 1024px splash image at 5.632x with a -51.2 offset, shown at SPLASH_SIZE.
const PX = SPLASH_SIZE / 1024;
const toPx = (unit: number) => (unit * 5.632 - 51.2) * PX;
const CELL = 200 * 0.405 * 5.632 * PX;
const HEX =
  "M94.91 4.94Q100 2 105.09 4.94L179.78 48.06Q184.87 51 184.87 56.88L184.87 143.12Q184.87 149 179.78 151.94L105.09 195.06Q100 198 94.91 195.06L20.22 151.94Q15.13 149 15.13 143.12L15.13 56.88Q15.13 51 20.22 48.06Z";
const CELLS = [
  { x: toPx(100), y: toPx(68.44645), colors: ["#e5c59e", "#d27e41", "#9A3412"] },
  { x: toPx(63.565098827223366), y: toPx(131.55355), colors: ["#b9c8f5", "#5b7be0", "#26408b"] },
  { x: toPx(136.43490117277662), y: toPx(131.55355), colors: ["#cfe3a8", "#7ea33f", "#3f5a1c"] },
];
const MID = { x: SPLASH_SIZE / 2, y: (CELLS[0]!.y + CELLS[1]!.y) / 2 };

const WAKE = 140; // ms before the first cell opens its eyes
const STAGGER = 110;
const MIN_SHOW = 1050; // the wake-up always finishes, even if the app is ready sooner
const MAX_WAIT = 4000; // never hold the app hostage to a slow network
const EXIT = 420;

const ease = Easing.bezier(0.22, 1, 0.36, 1);

function Mate({ index, progress, exit, motion }: { index: number; progress: SharedValue<number>; exit: SharedValue<number>; motion: boolean }) {
  const cell = CELLS[index]!;
  const eyes = useSharedValue(0);
  const hop = useSharedValue(0);

  useEffect(() => {
    if (!motion) return;
    const start = WAKE + index * STAGGER;
    eyes.value = withDelay(
      start,
      // Open, then the first mate blinks once while the others finish waking.
      index === 0
        ? withSequence(withTiming(1, { duration: 200, easing: ease }), withDelay(380, withTiming(0.1, { duration: 70 })), withTiming(1, { duration: 110 }))
        : withTiming(1, { duration: 200, easing: ease }),
    );
    hop.value = withDelay(start, withSequence(withTiming(-7, { duration: 150, easing: ease }), withSpring(0, { damping: 9, stiffness: 220 })));
  }, [eyes, hop, index, motion]);

  const body = useAnimatedStyle(() => {
    const away = exit.value;
    return {
      opacity: progress.value,
      transform: [
        { translateX: (cell.x - MID.x) * 0.35 * away },
        { translateY: hop.value + (cell.y - MID.y) * 0.35 * away },
        { scale: 1 - 0.12 * away },
      ],
    };
  });
  const eye = useAnimatedStyle(() => ({ opacity: eyes.value > 0.02 ? 1 : 0, transform: [{ scaleY: eyes.value }] }));

  return (
    <Animated.View style={[styles.cell, { left: cell.x - CELL / 2, top: cell.y - CELL / 2 }, body]}>
      <Svg width={CELL} height={CELL} viewBox="0 0 200 200">
        <Defs>
          <LinearGradient id={`splash${index}`} x1="1" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={cell.colors[0]} />
            <Stop offset="0.55" stopColor={cell.colors[1]} />
            <Stop offset="1" stopColor={cell.colors[2]} />
          </LinearGradient>
        </Defs>
        <Path d={HEX} fill={`url(#splash${index})`} />
      </Svg>
      <View style={styles.face} pointerEvents="none">
        <Animated.View style={[styles.eye, eye]} />
        <Animated.View style={[styles.eye, eye]} />
      </View>
    </Animated.View>
  );
}

/** Covers the app until it's ready and the wake-up has played, then fades out and unmounts. */
export function AnimatedSplash({ ready }: { ready: boolean }) {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const motion = !useReducedMotion();
  const [shownLongEnough, setShownLongEnough] = useState(!motion);
  const [timedOut, setTimedOut] = useState(false);
  const [gone, setGone] = useState(false);
  const cells = useSharedValue(1);
  const exit = useSharedValue(0);
  const veil = useSharedValue(1);

  useEffect(() => {
    const min = setTimeout(() => setShownLongEnough(true), motion ? MIN_SHOW : 0);
    const max = setTimeout(() => setTimedOut(true), MAX_WAIT);
    return () => {
      clearTimeout(min);
      clearTimeout(max);
    };
  }, [motion]);

  const leaving = (ready && shownLongEnough) || timedOut;
  useEffect(() => {
    if (!leaving) return;
    const done = () => setGone(true);
    if (motion) {
      exit.value = withTiming(1, { duration: EXIT, easing: ease });
      cells.value = withDelay(EXIT * 0.35, withTiming(0, { duration: EXIT * 0.65 }));
    }
    veil.value = withDelay(motion ? EXIT * 0.3 : 0, withTiming(0, { duration: motion ? EXIT * 0.7 : 250 }, (finished) => {
      if (finished) scheduleOnRN(done);
    }));
  }, [leaving, motion, exit, cells, veil]);

  const cover = useAnimatedStyle(() => ({ opacity: veil.value }));

  if (gone) return null;
  return (
    <Animated.View
      // The native splash hides only once this identical first frame is on screen.
      onLayout={() => void SplashScreen.hideAsync().catch(() => undefined)}
      pointerEvents={leaving ? "none" : "auto"}
      style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: SPLASH_BACKGROUND[scheme] }, cover]}
    >
      <View style={styles.mark}>
        {CELLS.map((_, index) => (
          <Mate key={index} index={index} progress={cells} exit={exit} motion={motion} />
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", zIndex: 1000 },
  mark: { width: SPLASH_SIZE, height: SPLASH_SIZE },
  cell: { position: "absolute", width: CELL, height: CELL },
  face: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: CELL * 0.16, paddingBottom: CELL * 0.06 },
  eye: { width: CELL * 0.085, height: CELL * 0.2, borderRadius: CELL * 0.05, backgroundColor: "#ffffff" },
});
