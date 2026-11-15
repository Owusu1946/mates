import { useEffect } from "react";
import { Text, View, type TextStyle } from "react-native";
import Animated, { cancelAnimation, Easing, interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming, type SharedValue } from "react-native-reanimated";
import { useTheme } from "../theme/provider";

/** Width of the highlight band, in letters. */
const BAND = 5;

/**
 * The colours a band passes through, from its edge to its centre. Two colours give a soft glow
 * (the memory line); three give a metallic glint: a darker steel edge, then a bright centre.
 */
export type ShimmerPalette = [string, string] | [string, string, string];

/** Brushed metal: grey text, a steel edge, a cool silver glint (dark mode glints near white). */
export function useMetalPalette(): ShimmerPalette {
  const { isDark } = useTheme();
  return isDark ? ["#8b8b94", "#d4d4d8", "#f8fafc"] : ["#8b8b94", "#3f3f46", "#c8cdd6"];
}

/** One letter: takes the band's colour as it passes over. */
function Letter({ char, index, total, progress, palette, style }: { char: string; index: number; total: number; progress: SharedValue<number>; palette: ShimmerPalette; style: TextStyle | TextStyle[] }) {
  const animated = useAnimatedStyle(() => {
    // The band travels from before the first letter to past the last, so both ends are invisible.
    const centre = progress.value * (total + BAND * 2) - BAND;
    const near = Math.max(0, 1 - Math.abs(index - centre) / BAND);
    const t = near * near * (3 - 2 * near);
    return palette.length === 3
      ? { color: interpolateColor(t, [0, 0.55, 1], palette) }
      : { color: interpolateColor(t, [0, 1], palette) };
  });
  return <Animated.Text style={[style, animated]}>{char}</Animated.Text>;
}

/**
 * Text with a band of light moving across it, driven by `progress` (0 → 1). The caller decides how
 * it moves: one pass (the memory line) or a loop (work in progress). Letters are laid out in a row,
 * so keep the text to one line: `maxChars` clips it with an ellipsis.
 */
export function ShimmerLetters({ text, progress, palette, style, maxChars = 60 }: { text: string; progress: SharedValue<number>; palette: ShimmerPalette; style: TextStyle | TextStyle[]; maxChars?: number }) {
  const shown = [...text].length > maxChars ? `${[...text].slice(0, maxChars - 1).join("").trimEnd()}…` : text;
  const letters = [...shown];
  return (
    // A hair of room on the right, so an italic last letter isn't clipped.
    <View accessible={false} style={{ flexDirection: "row", flexShrink: 1, overflow: "hidden", paddingRight: 2 }}>
      {letters.map((char, i) => (
        <Letter key={i} char={char} index={i} total={letters.length} progress={progress} palette={palette} style={style} />
      ))}
    </View>
  );
}

/** A band that sweeps across, rests briefly, and sweeps again for as long as `active`. */
export function useShimmerLoop(active: boolean, { sweepMs = 1500, restMs = 450 } = {}) {
  const progress = useSharedValue(0);
  useEffect(() => {
    if (!active) {
      cancelAnimation(progress);
      progress.value = 0;
      return;
    }
    // From 1 back to 0 happens off the end of the text, so the restart never shows.
    progress.value = withRepeat(withSequence(withTiming(1, { duration: sweepMs, easing: Easing.inOut(Easing.cubic) }), withDelay(restMs, withTiming(0, { duration: 0 }))), -1, false);
    return () => cancelAnimation(progress);
  }, [active, progress, sweepMs, restMs]);
  return progress;
}

/**
 * A live status line in brushed metal, like ChatGPT's "Thinking": a band of light loops across it
 * while `active`. Still, plain text when reduce motion is on or the work has stopped.
 */
export function ShimmerText({ text, active, style, maxChars }: { text: string; active: boolean; style: TextStyle; maxChars?: number }) {
  const reduced = useReducedMotion();
  const palette = useMetalPalette();
  const moving = active && !reduced;
  const progress = useShimmerLoop(moving);
  if (!moving) return <Text numberOfLines={1} style={[style, { color: palette[0], flexShrink: 1 }]}>{text}</Text>;
  // Keyed by the text, so a new status starts a fresh row of letters.
  return <ShimmerLetters key={text} text={text} progress={progress} palette={palette} style={style} maxChars={maxChars} />;
}
