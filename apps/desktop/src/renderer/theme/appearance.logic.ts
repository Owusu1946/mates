/**
 * How the app looks: a colour scheme (System follows the computer, or always Light or Dark) and
 * a theme. Nightly, after T3 Code's palette, is the default; Harmattan is the Mates look.
 */

export type ColorScheme = "system" | "light" | "dark";
export type ThemeName = "nightly" | "harmattan";
export type Appearance = { scheme: ColorScheme; theme: ThemeName };

export const DEFAULT_APPEARANCE: Appearance = { scheme: "system", theme: "nightly" };

export const THEMES: { name: ThemeName; label: string }[] = [
  { name: "nightly", label: "Nightly" },
  { name: "harmattan", label: "Harmattan" },
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
