/**
 * How the app looks: a colour scheme (System follows the computer, or always Light or Dark) and
 * a theme. Nightly, after T3 Code's palette, is the default; Harmattan is the Mates look. Kakum,
 * Labadi and Volta adapt T3 Code's Grove, Ocean and Iris; Kente and Cocoa are our own. Each theme's
 * colours live in styles.css, light and dark.
 */

export type ColorScheme = "system" | "light" | "dark";
export type ThemeName = "nightly" | "harmattan" | "kakum" | "labadi" | "volta" | "kente" | "cocoa";
export type Appearance = { scheme: ColorScheme; theme: ThemeName };

export const DEFAULT_APPEARANCE: Appearance = { scheme: "system", theme: "nightly" };

export type ThemeOption = {
  name: ThemeName;
  label: string;
  /** One line for Settings. */
  blurb: string;
  /** The theme's own light colours, for previews drawn whatever theme is showing. */
  swatch: { canvas: string; brand: string; ink: string };
};

export const THEMES: ThemeOption[] = [
  { name: "nightly", label: "Nightly", blurb: "Crisp and neutral, after T3 Code.", swatch: { canvas: "#fcfcfc", brand: "oklch(0.488 0.217 264)", ink: "#18181b" } },
  { name: "harmattan", label: "Harmattan", blurb: "Warm, in the Mates colours.", swatch: { canvas: "#f8f7f4", brand: "#d27e41", ink: "#222522" } },
  { name: "kakum", label: "Kakum", blurb: "Rainforest greens.", swatch: { canvas: "oklch(0.972369 0.005497 157.15)", brand: "oklch(0.523295 0.112292 158.089)", ink: "oklch(0.222003 0.03479 328.979)" } },
  { name: "labadi", label: "Labadi", blurb: "Sea blues.", swatch: { canvas: "oklch(0.974199 0.002856 241.597)", brand: "oklch(0.536684 0.120219 247.01)", ink: "oklch(0.222003 0.03479 328.979)" } },
  { name: "volta", label: "Volta", blurb: "Violet dusk over the lake.", swatch: { canvas: "oklch(0.976531 0.003855 303.226)", brand: "oklch(0.525348 0.15373 294.176)", ink: "oklch(0.222003 0.03479 328.979)" } },
  { name: "kente", label: "Kente", blurb: "Kente gold, on cream or charcoal.", swatch: { canvas: "oklch(0.975 0.008 85)", brand: "oklch(0.78 0.155 82)", ink: "oklch(0.22 0.02 60)" } },
  { name: "cocoa", label: "Cocoa", blurb: "Warm browns and caramel.", swatch: { canvas: "oklch(0.968 0.008 55)", brand: "oklch(0.52 0.1 45)", ink: "oklch(0.24 0.03 40)" } },
];

/** Whether the app is dark right now. */
export function isDark(scheme: ColorScheme, systemDark: boolean): boolean {
  return scheme === "dark" || (scheme === "system" && systemDark);
}

/** A saved appearance, with anything unreadable or unknown falling back to the default. */
export function parseAppearance(saved: string | null): Appearance {
  if (!saved) return DEFAULT_APPEARANCE;
  try {
    const value = JSON.parse(saved) as Partial<Appearance>;
    return {
      scheme: value.scheme === "light" || value.scheme === "dark" || value.scheme === "system" ? value.scheme : DEFAULT_APPEARANCE.scheme,
      theme: THEMES.some((theme) => theme.name === value.theme) ? (value.theme as ThemeName) : DEFAULT_APPEARANCE.theme,
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}
