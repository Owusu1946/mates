import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, useColorScheme, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  cancelAnimation,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";
import { PolygonAvatar } from "../components/polygon-avatar/polygon-avatar";
import { CIRCLE as CIRCLE_SHAPE, SHAPE, TRIANGLE as TRIANGLE_SHAPE, type PolygonShape } from "../components/polygon-avatar/polygon-avatar-core";
import { CIRCLE, HEXAGON, OUTLINE_POINTS, TRIANGLE } from "./outlines";

/**
 * The hand-off from the native splash. It starts on the same honeycomb in the same spot; the
 * cells part and melt into their own shapes, wake up as mates and look at each other, then
 * part to reveal the app.
 *
 * Up to the shapes, everything runs on the UI thread. The mascot engine draws through JS, so it
 * takes over only if this phone kept up during the morph; otherwise the shapes breathe on the
 * UI thread until the app is ready.
 */

/** Matches `imageWidth` for expo-splash-screen in app.json, so the first frame lines up. */
export const SPLASH_SIZE = 200;
export const SPLASH_BACKGROUND = { light: "#ffffff", dark: "#09090b" };

// Geometry from brand/generate.mjs: cells laid out in a 200-unit box, drawn into the
// 1024px splash image at 5.632x with a -51.2 offset, shown at SPLASH_SIZE.
const PX = SPLASH_SIZE / 1024;
const toPx = (unit: number) => (unit * 5.632 - 51.2) * PX;
const CELL = 200 * 0.405 * 5.632 * PX;
// The engine fits the same 200-unit artwork into its 258.541-unit view box at 1.183782x, centred.
const AVATAR = (CELL * 258.541) / (200 * 1.183782);

type Cell = { x: number; y: number; colors: [string, string, string]; outline: number[]; shape: PolygonShape; gaze: { x: number; y: number } };
const CELLS: Cell[] = [
  { x: toPx(100), y: toPx(68.44645), colors: ["#e5c59e", "#d27e41", "#9A3412"], outline: HEXAGON, shape: SHAPE, gaze: { x: 0, y: 0.7 } },
  { x: toPx(63.565098827223366), y: toPx(131.55355), colors: ["#b9c8f5", "#5b7be0", "#26408b"], outline: CIRCLE, shape: CIRCLE_SHAPE, gaze: { x: 0.75, y: -0.35 } },
  { x: toPx(136.43490117277662), y: toPx(131.55355), colors: ["#cfe3a8", "#7ea33f", "#3f5a1c"], outline: TRIANGLE, shape: TRIANGLE_SHAPE, gaze: { x: -0.75, y: -0.35 } },
];
const MID = { x: SPLASH_SIZE / 2, y: (CELLS[0]!.y + CELLS[1]!.y) / 2 };

const WAKE = 120; // ms of plain honeycomb before anything moves
const MORPH = 460;
const SPREAD = 0.3; // how far the cells part while morphing, relative to their offset from the middle
const EYES_IN = 160;
const ALIVE = 1100; // the least time the mates spend alive, looking at each other
const MAX_WAIT = 4000; // never hold the app hostage to a slow network
const EXIT = 420;

const ease = Easing.bezier(0.22, 1, 0.36, 1);
const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Where a cell sits: parted from the middle by `spread`, shrinking a touch as it leaves; `breath` (1 = rest) gently scales it. */
function usePlacement(cell: Cell, spread: SharedValue<number>, fade: SharedValue<number>, breath?: SharedValue<number>) {
  return useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [
      { translateX: (cell.x - MID.x) * spread.value },
      { translateY: (cell.y - MID.y) * spread.value },
      { scale: (1 - 0.25 * Math.max(0, spread.value - SPREAD)) * (breath?.value ?? 1) },
    ],
  }));
}

function MorphingCell({ cell, index, morph, spread, fade, breath }: { cell: Cell; index: number; morph: SharedValue<number>; spread: SharedValue<number>; fade: SharedValue<number>; breath: SharedValue<number> }) {
  const placement = usePlacement(cell, spread, fade, breath);
  const to = cell.outline;
  const outline = useAnimatedProps(() => {
    const t = morph.value;
    let d = "";
    for (let i = 0; i < OUTLINE_POINTS * 2; i += 2) {
      const x = HEXAGON[i]! + (to[i]! - HEXAGON[i]!) * t;
      const y = HEXAGON[i + 1]! + (to[i + 1]! - HEXAGON[i + 1]!) * t;
      d += (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
    }
    return { d: d + "Z" };
  });

  return (
    <Animated.View style={[styles.cell, { left: cell.x - CELL / 2, top: cell.y - CELL / 2 }, placement]}>
      <Svg width={CELL} height={CELL} viewBox="0 0 200 200">
        <Defs>
          <LinearGradient id={`splash${index}`} x1="1" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={cell.colors[0]} />
            <Stop offset="0.55" stopColor={cell.colors[1]} />
            <Stop offset="1" stopColor={cell.colors[2]} />
          </LinearGradient>
        </Defs>
        <AnimatedPath animatedProps={outline} fill={`url(#splash${index})`} />
      </Svg>
    </Animated.View>
  );
}

/** The same silhouette drawn by the mascot engine: eyes fade in and the mates look at each other. */
function LivingMate({ cell, cheer, spread, fade }: { cell: Cell; cheer: boolean; spread: SharedValue<number>; fade: SharedValue<number> }) {
  const placement = usePlacement(cell, spread, fade);
  return (
    <Animated.View style={[styles.avatar, { left: cell.x - AVATAR / 2, top: cell.y - AVATAR / 2 }, placement]}>
      <PolygonAvatar size={AVATAR} shape={cell.shape} gradient={cell.colors} state={cheer ? "happy" : "idle"} gaze={cell.gaze} lookAround={0} frameRate={30} title={null} />
    </Animated.View>
  );
}

/**
 * Whether the JS thread holds ~24 fps over `ms` (null until measured), which the engine needs.
 * Dev builds run JS several times slower than release, so there it always says yes.
 */
function useJsKeepsUp(ms: number, enabled: boolean) {
  const [keepsUp, setKeepsUp] = useState<boolean | null>(__DEV__ ? enabled : null);
  useEffect(() => {
    if (!enabled || __DEV__) return;
    let frames = 0;
    let raf = 0;
    const started = Date.now();
    const tick = () => {
      frames++;
      if (Date.now() - started < ms) raf = requestAnimationFrame(tick);
      else setKeepsUp(frames >= (ms / 1000) * 24);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ms, enabled]);
  return keepsUp;
}

/** "alive": the engine has the mates. "shaped": they stay plain shapes (slow phone or Reduce Motion). */
type Phase = "morphing" | "alive" | "shaped" | "leaving" | "gone";

/** Covers the app until it's ready and the intro has played, then fades out and unmounts. */
export function AnimatedSplash({ ready }: { ready: boolean }) {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const motion = !useReducedMotion();
  const [phase, setPhase] = useState<Phase>(motion ? "morphing" : "shaped");
  const [introDone, setIntroDone] = useState(!motion);
  const [awake, setAwake] = useState(false);
  const [cheer, setCheer] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const keepsUp = useJsKeepsUp(MORPH, motion);
  const keepsUpRef = useRef(keepsUp);
  keepsUpRef.current = keepsUp;

  const morph = useSharedValue(0);
  const spread = useSharedValue(0);
  const shapes = useSharedValue(1);
  const mates = useSharedValue(0);
  const veil = useSharedValue(1);
  const breath = useSharedValue(1);

  useEffect(() => {
    const max = setTimeout(() => setTimedOut(true), MAX_WAIT);
    if (!motion) return () => clearTimeout(max);
    morph.value = withDelay(WAKE, withTiming(1, { duration: MORPH, easing: ease }));
    spread.value = withDelay(WAKE, withTiming(SPREAD, { duration: MORPH, easing: ease }));
    // Shaped: wake up straight away if this phone can afford the engine. Loading carries on
    // underneath; it's mostly network, so the JS thread has room.
    const morphed = setTimeout(() => setPhase(keepsUpRef.current === false ? "shaped" : "alive"), WAKE + MORPH);
    return () => {
      clearTimeout(max);
      clearTimeout(morphed);
    };
  }, [motion, morph, spread]);

  useEffect(() => {
    if (__DEV__) console.log("splash", phase, { ready, keepsUp, introDone, timedOut });
  }, [phase, ready, keepsUp, introDone, timedOut]);

  useEffect(() => {
    if (phase === "alive") {
      setAwake(true);
      mates.value = withTiming(1, { duration: EYES_IN });
      shapes.value = withDelay(EYES_IN, withTiming(0, { duration: 1 }));
      const cheerUp = setTimeout(() => setCheer(true), ALIVE * 0.4);
      const played = setTimeout(() => setIntroDone(true), ALIVE);
      return () => {
        clearTimeout(cheerUp);
        clearTimeout(played);
      };
    }
    if (phase === "shaped" && motion) {
      // Plain shapes breathe on the UI thread while the app finishes loading.
      breath.value = withRepeat(withSequence(withTiming(1.035, { duration: 700, easing: Easing.inOut(Easing.sin) }), withTiming(1, { duration: 700, easing: Easing.inOut(Easing.sin) })), -1);
      setIntroDone(true);
    }
    if (phase === "leaving") {
      cancelAnimation(breath);
      const gone = () => setPhase("gone");
      if (motion) spread.value = withTiming(SPREAD + 0.4, { duration: EXIT, easing: ease });
      veil.value = withDelay(
        motion ? EXIT * 0.3 : 0,
        withTiming(0, { duration: motion ? EXIT * 0.7 : 250 }, (finished) => {
          if (finished) scheduleOnRN(gone);
        }),
      );
    }
  }, [phase, motion, mates, shapes, spread, veil, breath]);

  // The intro always plays in full; then go in once the app knows where to send the user.
  // The cap only stops a slow network holding the splash, never the mates mid-intro.
  useEffect(() => {
    if ((phase === "alive" || phase === "shaped") && introDone && (ready || timedOut)) setPhase("leaving");
  }, [phase, introDone, ready, timedOut]);

  const cover = useAnimatedStyle(() => ({ opacity: veil.value }));

  if (phase === "gone") return null;
  return (
    <Animated.View
      // The native splash hides only once this identical first frame is on screen.
      onLayout={() => void SplashScreen.hideAsync().catch(() => undefined)}
      pointerEvents={phase === "leaving" ? "none" : "auto"}
      style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: SPLASH_BACKGROUND[scheme] }, cover]}
    >
      <View style={styles.mark}>
        {CELLS.map((cell, index) => (
          <MorphingCell key={index} cell={cell} index={index} morph={morph} spread={spread} fade={shapes} breath={breath} />
        ))}
        {awake ? CELLS.map((cell, index) => <LivingMate key={index} cell={cell} cheer={cheer && index === 0} spread={spread} fade={mates} />) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", zIndex: 1000 },
  mark: { width: SPLASH_SIZE, height: SPLASH_SIZE },
  cell: { position: "absolute", width: CELL, height: CELL },
  avatar: { position: "absolute", width: AVATAR, height: AVATAR },
});
