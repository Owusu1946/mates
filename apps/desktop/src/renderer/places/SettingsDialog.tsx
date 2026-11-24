import { Dialog } from "@base-ui/react/dialog";
import { Tabs } from "@base-ui/react/tabs";
import type { ReactNode } from "react";
import { ChatActivityPreview } from "../chat/ChatActivityPreview.tsx";
import { buttonVariants } from "../components/ui/Button.tsx";
import { Icon } from "../components/ui/Icon.tsx";
import type { SampleProfile } from "../data/sampleCrew.ts";
import { cn } from "../lib/utils.ts";
import type { ColorScheme, ThemeName } from "../theme/appearance.logic.ts";
import { THEMES } from "../theme/appearance.logic.ts";
import { setAppearance, useAppearance } from "../theme/appearance.ts";

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

type ChatActivitySettingsProps = {
  activityMode: ChatActivityMode;
  onActivityMode: (mode: ChatActivityMode) => void;
};

type SettingsDialogProps = ChatActivitySettingsProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile?: SampleProfile;
};

const SECTIONS = [
  { id: "activity", label: "Chat activity", icon: "activity" },
  { id: "appearance", label: "Appearance", icon: "sun" },
  { id: "about", label: "About you", icon: "users" },
] as const;

export function SettingsDialog({ open, onOpenChange, activityMode, onActivityMode, profile }: SettingsDialogProps) {
  const showProfile = profile && (profile.bio.length > 0 || profile.memories.length > 0);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/25 backdrop-blur-[2px] dark:bg-black/55" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex h-[min(42rem,calc(100dvh-3rem))] w-[min(60rem,calc(100vw-2.5rem))] -translate-1/2 flex-col overflow-hidden rounded-2xl border border-line bg-raised text-ink shadow-2xl shadow-black/20 outline-none">
          <header className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
            <Dialog.Title className="font-semibold">Settings</Dialog.Title>
            <Dialog.Close aria-label="Close settings" className={buttonVariants({ variant: "ghost-muted", size: "icon-sm" })}>
              <Icon name="x" />
            </Dialog.Close>
          </header>
          <Tabs.Root defaultValue="activity" orientation="vertical" className="flex min-h-0 flex-1">
            <Tabs.List aria-label="Settings sections" activateOnFocus className="flex w-36 shrink-0 flex-col gap-1 border-r border-line bg-rail p-2 min-[850px]:w-44">
              {SECTIONS.filter((section) => section.id !== "about" || showProfile).map((section) => (
                <Tabs.Tab key={section.id} value={section.id} className="flex h-8 cursor-pointer items-center gap-2 rounded-control px-2 text-left text-sm text-ink-soft outline-none hover:bg-rail-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset data-active:bg-rail-selected data-active:text-ink">
                  <Icon name={section.icon} size={16} />
                  {section.label}
                </Tabs.Tab>
              ))}
            </Tabs.List>
            <Tabs.Panel value="activity" className="min-w-0 flex-1 overflow-y-auto overscroll-contain outline-none">
              <ChatActivitySettings activityMode={activityMode} onActivityMode={onActivityMode} />
            </Tabs.Panel>
            <Tabs.Panel value="appearance" className="min-w-0 flex-1 overflow-y-auto overscroll-contain outline-none">
              <AppearanceSettings />
            </Tabs.Panel>
            {showProfile && (
              <Tabs.Panel value="about" className="min-w-0 flex-1 overflow-y-auto overscroll-contain outline-none">
                <div className="mx-auto flex max-w-3xl flex-col gap-5 px-5 py-5 min-[850px]:px-7">
                  <div>
                    <h2 className="text-base font-semibold">About you</h2>
                    <p className="mt-1 text-sm text-ink-soft">What you added during setup. It stays in this session.</p>
                  </div>
                  {profile.bio && <p className="rounded-xl border border-line bg-canvas p-4 wrap-anywhere whitespace-pre-wrap select-text">{profile.bio}</p>}
                  {profile.memories.length > 0 && (
                    <section>
                      <h3 className="mb-2 font-semibold">Imported memories</h3>
                      <ul className="divide-y divide-line rounded-xl border border-line bg-canvas">
                        {profile.memories.map((memory) => <li key={memory} className="px-4 py-2.5 wrap-anywhere select-text">{memory}</li>)}
                      </ul>
                    </section>
                  )}
                </div>
              </Tabs.Panel>
            )}
          </Tabs.Root>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ChatActivitySettings({ activityMode, onActivityMode }: ChatActivitySettingsProps) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-5 min-[850px]:px-7">
      <fieldset>
        <legend className="text-base font-semibold">Chat activity</legend>
        <p className="mt-1 mb-3 text-sm text-ink-soft">Choose how much progress to see while a mate works.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {([
            { value: "quiet", label: "Quiet", description: "Hide routine work steps." },
            { value: "detailed", label: "Detailed", description: "Show work steps inline." },
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
      <ChatActivityPreview />
    </div>
  );
}

function AppearanceSettings() {
  const { scheme, theme } = useAppearance();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-5 min-[850px]:px-7">
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
  );
}
