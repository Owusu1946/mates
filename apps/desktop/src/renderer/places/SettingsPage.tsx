import type { ReactNode } from "react";
import type { ColorScheme, ThemeName } from "../theme/appearance.logic.ts";
import { THEMES } from "../theme/appearance.logic.ts";
import { setAppearance, useAppearance } from "../theme/appearance.ts";
import { cn } from "../lib/utils.ts";

/**
 * The previews' own colours. They show a scheme or theme whatever the app is using right now, so
 * they can't use the live tokens; the values are the themes' canvas, raised, line and brand.
 */
const SCHEME_PREVIEW = {
  light: { canvas: "#fcfcfc", raised: "#ffffff", line: "#e4e4e7", ink: "#d4d4d8" },
  dark: { canvas: "#000000", raised: "#0f0f0f", line: "#262626", ink: "#404040" },
};
const THEME_BRAND: Record<ThemeName, { brand: string; canvas: string }> = {
  nightly: { brand: "oklch(0.488 0.217 264)", canvas: "#fcfcfc" },
  harmattan: { brand: "#d27e41", canvas: "#f8f7f4" },
};

const SCHEMES: { value: ColorScheme; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function Window({ colors }: { colors: (typeof SCHEME_PREVIEW)["light"] }) {
  return (
    <div className="flex h-full flex-1 gap-1.5 p-2" style={{ background: colors.canvas }}>
      <div className="w-1/4 rounded-sm" style={{ background: colors.raised, boxShadow: `inset 0 0 0 1px ${colors.line}` }} />
      <div className="flex flex-1 flex-col justify-end gap-1">
        <div className="h-1.5 w-2/3 rounded-full" style={{ background: colors.ink }} />
        <div className="h-3 rounded-sm" style={{ background: colors.raised, boxShadow: `inset 0 0 0 1px ${colors.line}` }} />
      </div>
    </div>
  );
}

function Choice({ selected, label, onSelect, children }: { selected: boolean; label: string; onSelect: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex flex-col gap-2 rounded-xl border p-1.5 pb-2 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand",
        selected ? "border-brand bg-raised" : "border-line hover:bg-hover-fill",
      )}
    >
      <div className="flex h-20 overflow-hidden rounded-lg border border-line">{children}</div>
      <span className="px-1 text-sm font-medium">{label}</span>
    </button>
  );
}

export type ChatActivityMode = "quiet" | "detailed";

export function SettingsPage({ activityMode, onActivityMode }: {
  activityMode: ChatActivityMode;
  onActivityMode: (mode: ChatActivityMode) => void;
}) {
  const { scheme, theme } = useAppearance();
  return (
    <div className="h-full animate-fade overflow-y-auto">
      <div className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-10">
        <h1 className="text-xl font-semibold">Settings</h1>
        <fieldset className="flex flex-col gap-3">
          <legend className="font-semibold">Chat activity</legend>
          <p className="text-ink-soft">Choose how much progress to see while a mate works.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {([
              { value: "quiet", label: "Quiet", description: "Open activity when you want a closer look." },
              { value: "detailed", label: "Detailed", description: "Show routine progress in the conversation." },
            ] as const).map((option) => (
              <label key={option.value} className={cn("flex cursor-pointer gap-2 rounded-lg border p-3", activityMode === option.value ? "border-brand bg-raised" : "border-line hover:bg-hover-fill")}>
                <input
                  type="radio"
                  name="chat-activity"
                  checked={activityMode === option.value}
                  onChange={() => onActivityMode(option.value)}
                  className="self-start accent-brand"
                />
                <span>
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="block text-xs text-ink-soft">{option.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="font-semibold">Color scheme</h2>
            <p className="text-ink-soft">System follows your computer.</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {SCHEMES.map((option) => (
              <Choice key={option.value} selected={scheme === option.value} label={option.label} onSelect={() => setAppearance({ scheme: option.value })}>
                {option.value !== "dark" && <Window colors={SCHEME_PREVIEW.light} />}
                {option.value !== "light" && <Window colors={SCHEME_PREVIEW.dark} />}
              </Choice>
            ))}
          </div>
        </section>
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="font-semibold">Theme</h2>
            <p className="text-ink-soft">Nightly is crisp and neutral. Harmattan is warm, in the Mates colours.</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {THEMES.map((option) => (
              <Choice key={option.name} selected={theme === option.name} label={option.label} onSelect={() => setAppearance({ theme: option.name })}>
                <div className="flex flex-1 items-end gap-1.5 p-2" style={{ background: THEME_BRAND[option.name].canvas }}>
                  <div className="h-3 flex-1 rounded-sm bg-black/8" />
                  <div className="size-5 rounded-full" style={{ background: THEME_BRAND[option.name].brand }} />
                </div>
              </Choice>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
