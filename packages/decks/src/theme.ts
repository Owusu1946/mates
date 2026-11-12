import type { ThemeInput } from "./schema";

/**
 * Slide colours, all derived from the mate's gradient and the app's neutrals, so a deck looks like
 * the mate that made it and no colour is invented.
 */
export type Palette = {
  paper: string;
  ink: string;
  muted: string;
  accent: string;
  /** Text and marks drawn on top of `accent`. */
  onAccent: string;
  /** Cards and panels: a whisper of the accent on paper. */
  surface: string;
  /** Series colours for charts, accent first. */
  series: string[];
};

const LIGHT = { paper: "#FFFFFF", ink: "#0A0A0A", muted: "#52525B" };
const DARK = { paper: "#0A0A0A", ink: "#FAFAFA", muted: "#A1A1AA" };

const channels = (hex: string) => {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? [...value].map((c) => c + c).join("") : value;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
};
const toHex = (rgb: number[]) => `#${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;

/** `amount` of `a` over `b` (0 → b, 1 → a). */
export function mix(a: string, b: string, amount: number) {
  const [x, y] = [channels(a), channels(b)];
  return toHex(x.map((c, i) => c * amount + y[i]! * (1 - amount)));
}

/** Relative luminance (WCAG), for picking readable text on a colour. */
export function luminance(hex: string) {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
}

export function palette(theme: ThemeInput): Palette {
  const [light, mid, deep] = theme.gradient;
  const neutrals = theme.mode === "dark" ? DARK : LIGHT;
  // The accent must read as text on paper: the mid stop usually does; otherwise the stop that does.
  const candidates = theme.mode === "dark" ? [mid, light] : [mid, deep];
  const accent = candidates.find((c) => contrast(c, neutrals.paper) >= 3) ?? (theme.mode === "dark" ? light : deep);
  const onAccent = contrast(LIGHT.paper, accent) >= contrast(LIGHT.ink, accent) ? LIGHT.paper : LIGHT.ink;
  const surface = mix(accent, neutrals.paper, theme.mode === "dark" ? 0.16 : 0.08);
  const series = [accent, theme.mode === "dark" ? light : deep, mix(accent, neutrals.paper, 0.55), mix(deep, neutrals.paper, 0.7), mix(light, neutrals.ink, 0.7), mix(accent, neutrals.ink, 0.6), mix(mid, neutrals.paper, 0.3), neutrals.muted];
  return { ...neutrals, accent, onAccent, surface, series };
}
