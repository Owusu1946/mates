import { Dialog } from "@base-ui/react/dialog";
import { Tabs } from "@base-ui/react/tabs";
import type { ReactNode } from "react";
import { ACTIVITY_MODES, type ChatActivityMode } from "../chat/activityModes.ts";
import { ChatActivityPreview } from "../chat/ChatActivityPreview.tsx";
import { buttonVariants } from "../components/ui/Button.tsx";
import { Icon } from "../components/ui/Icon.tsx";
import type { SampleProfile } from "../data/sampleCrew.ts";
import { cn } from "../lib/utils.ts";
import { AboutSettings } from "../settings/AboutSettings.tsx";
import { AccountSettings } from "../settings/AccountSettings.tsx";
import { AppsSettings } from "../settings/AppsSettings.tsx";
import { CODING_CHOICES } from "../settings/coding.logic.ts";
import { ComputerSettings } from "../settings/ComputerSettings.tsx";
import { MatesSettings } from "../settings/MatesSettings.tsx";
import { NotificationsSettings } from "../settings/NotificationsSettings.tsx";
import { SettingsPage } from "../settings/SettingsParts.tsx";
import { UsageSettings } from "../settings/UsageSettings.tsx";
import { VoiceSettings } from "../settings/VoiceSettings.tsx";
import { markCodingEngaged, setCodingPreference, useCoding } from "../settings/coding.ts";
import type { ColorScheme } from "../theme/appearance.logic.ts";
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
        "flex flex-col gap-2 rounded-xl border p-1.5 pb-2 text-left outline-none transition-[background-color,border-color,scale] duration-150 ease-out-soft active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-brand",
        selected ? "border-brand bg-raised" : "border-line hover:bg-hover-fill",
      )}
    >
      <div className="flex h-20 overflow-hidden rounded-lg border border-line">{children}</div>
      <span className="px-1 text-sm font-medium">{label}</span>
    </button>
  );
}

type ChatActivitySettingsProps = {
  activityMode: ChatActivityMode;
  onActivityMode: (mode: ChatActivityMode) => void;
};

type SettingsDialogProps = ChatActivitySettingsProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  you: string;
  onSignOut: () => void;
  profile?: SampleProfile;
  /** Whether the coding tools show right now, for the Coding tab's status line. */
  codingShown: boolean;
  /** The tab it opens on, e.g. Usage from the profile menu. */
  section?: string;
};

/** Three short groups, so it's clear where each thing lives: you, your mates, and this app. */
const SECTION_GROUPS = [
  [
    { id: "account", label: "Account", icon: "user" },
    { id: "usage", label: "Usage", icon: "clock" },
  ],
  [
    { id: "mates", label: "Mates", icon: "users" },
    { id: "apps", label: "Apps", icon: "grid" },
    { id: "notifications", label: "Notifications", icon: "bell" },
  ],
  [
    { id: "appearance", label: "Appearance", icon: "sun" },
    { id: "voice", label: "Keyboard & voice", icon: "keyboard" },
    { id: "computer", label: "This computer", icon: "monitor" },
    { id: "coding", label: "Coding", icon: "branch" },
    { id: "about", label: "About", icon: "info" },
  ],
] as const;

const PANEL = "motion-swap col-start-1 row-start-1 min-h-0 min-w-0 overflow-y-auto overscroll-contain outline-none";

export function SettingsDialog({ open, onOpenChange, you, onSignOut, activityMode, onActivityMode, profile, codingShown, section = "account" }: SettingsDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="motion-backdrop fixed inset-0 z-50 bg-black/25 backdrop-blur-[2px] dark:bg-black/55" />
        <Dialog.Popup className="motion-dialog fixed top-1/2 left-1/2 z-50 flex h-[min(42rem,calc(100dvh-3rem))] w-[min(60rem,calc(100vw-2.5rem))] -translate-1/2 flex-col overflow-hidden rounded-2xl border border-line bg-raised text-ink shadow-2xl shadow-black/20 outline-none">
          <header className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
            <Dialog.Title className="font-semibold">Settings</Dialog.Title>
            <Dialog.Close aria-label="Close settings" className={buttonVariants({ variant: "ghost-muted", size: "icon-sm" })}>
              <Icon name="x" />
            </Dialog.Close>
          </header>
          <Tabs.Root key={open ? section : "closed"} defaultValue={section} orientation="vertical" className="flex min-h-0 flex-1">
            <Tabs.List aria-label="Settings sections" activateOnFocus className="flex w-40 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-line bg-rail p-2 min-[850px]:w-48">
              {SECTION_GROUPS.map((group, index) => (
                <div key={group[0].id} className={cn("flex flex-col gap-0.5", index > 0 && "mt-2 border-t border-line pt-2")}>
                  {group.map((section) => (
                    <Tabs.Tab key={section.id} value={section.id} className="flex h-8 cursor-pointer items-center gap-2 rounded-control px-2 text-left text-sm text-ink-soft outline-none transition-colors duration-150 hover:bg-rail-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset data-active:bg-rail-selected data-active:text-ink">
                      <Icon name={section.icon} size={16} />
                      {section.label}
                    </Tabs.Tab>
                  ))}
                </div>
              ))}
            </Tabs.List>
            <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-1">
              <Tabs.Panel value="account" className={PANEL}>
                <AccountSettings you={you} onSignOut={onSignOut} />
              </Tabs.Panel>
              <Tabs.Panel value="usage" className={PANEL}>
                <UsageSettings />
              </Tabs.Panel>
              <Tabs.Panel value="mates" className={PANEL}>
                <MatesSettings profile={profile} />
              </Tabs.Panel>
              <Tabs.Panel value="apps" className={PANEL}>
                <AppsSettings />
              </Tabs.Panel>
              <Tabs.Panel value="notifications" className={PANEL}>
                <NotificationsSettings />
              </Tabs.Panel>
              <Tabs.Panel value="appearance" className={PANEL}>
                <AppearanceSettings activityMode={activityMode} onActivityMode={onActivityMode} />
              </Tabs.Panel>
              <Tabs.Panel value="voice" className={PANEL}>
                <VoiceSettings />
              </Tabs.Panel>
              <Tabs.Panel value="computer" className={PANEL}>
                <ComputerSettings />
              </Tabs.Panel>
              <Tabs.Panel value="coding" className={PANEL}>
                <CodingSettings shown={codingShown} />
              </Tabs.Panel>
              <Tabs.Panel value="about" className={PANEL}>
                <AboutSettings />
              </Tabs.Panel>
            </div>
          </Tabs.Root>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ChatActivitySettings({ activityMode, onActivityMode }: ChatActivitySettingsProps) {
  return (
    <section className="flex flex-col gap-3">
      <fieldset>
        <legend className="text-sm font-medium">Chat activity</legend>
        <p className="mb-3 text-xs text-ink-soft">How much progress to see while a mate works.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {ACTIVITY_MODES.map((option) => (
            <label key={option.value} className="grid cursor-pointer grid-cols-[1rem_minmax(0,1fr)] content-start items-center gap-x-2.5 gap-y-0.5 rounded-lg border border-line px-3 py-2.5 transition-colors duration-150 hover:bg-hover-fill has-checked:border-brand has-checked:bg-soft has-focus-visible:ring-2 has-focus-visible:ring-brand/35">
              <input
                type="radio"
                name="chat-activity"
                checked={activityMode === option.value}
                onChange={() => onActivityMode(option.value)}
                className="activity-radio m-0 size-4"
              />
              <span className="text-sm leading-5 font-medium">{option.label}</span>
              <span className="col-start-2 text-xs leading-4 text-ink-soft">{option.description}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <ChatActivityPreview />
    </section>
  );
}

/**
 * Whether Mates shows its coding tools. Mates is a personal assistant first, so by default they
 * appear only once you start coding; until then, code a mate does shows as a card in its chat.
 */
function CodingSettings({ shown }: { shown: boolean }) {
  const { preference, engaged } = useCoding();
  return (
    <SettingsPage title="Coding" description="Your mates can code and build websites either way. This is about the tools you see.">
      <fieldset>
        <legend className="text-sm font-medium">Coding tools</legend>
        <p className="mb-3 text-xs text-ink-soft">Projects in the sidebar, coding runs, the Diff panel and the terminal.</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {CODING_CHOICES.map((option) => (
            <label key={option.value} className="grid cursor-pointer grid-cols-[1rem_minmax(0,1fr)] content-start items-center gap-x-2.5 gap-y-0.5 rounded-lg border border-line px-3 py-2.5 transition-colors duration-150 hover:bg-hover-fill has-checked:border-brand has-checked:bg-soft has-focus-visible:ring-2 has-focus-visible:ring-brand/35">
              <input type="radio" name="coding" checked={preference === option.value} onChange={() => setCodingPreference(option.value)} className="activity-radio m-0 size-4" />
              <span className="text-sm leading-5 font-medium">{option.label}</span>
              <span className="col-start-2 text-xs leading-4 text-ink-soft">{option.detail}</span>
            </label>
          ))}
        </div>
        <p className="mt-3 flex items-center gap-2 text-xs text-ink-soft">
          <span className={cn("size-1.5 rounded-full", shown ? "bg-ok" : "bg-ink-soft")} />
          {shown ? "Showing now." : "Hidden now. Code your mates do shows as cards in their chats."}
        </p>
      </fieldset>
      <section className="flex items-center gap-4 rounded-xl border border-line bg-canvas p-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-soft text-ink-soft">
          <Icon name="branch" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">GitHub</h3>
          <p className="text-sm text-ink-soft">{engaged ? "Connected as ama-mensah (sample)." : "Connect it so your mates can work in your projects and open pull requests."}</p>
        </div>
        <button type="button" disabled={engaged} onClick={markCodingEngaged} className={buttonVariants({ variant: engaged ? "secondary" : "outline", size: "sm" })}>
          {engaged ? "Connected" : "Connect GitHub"}
        </button>
      </section>
    </SettingsPage>
  );
}

function AppearanceSettings(activity: ChatActivitySettingsProps) {
  const { scheme, theme } = useAppearance();
  return (
    <SettingsPage title="Appearance" description="How Mates looks, and how much you see while a mate works.">
      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-medium">Color scheme</h3>
          <p className="text-xs text-ink-soft">System follows your computer.</p>
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
          <h3 className="text-sm font-medium">Theme</h3>
          <p className="text-xs text-ink-soft">{THEMES.find((option) => option.name === theme)?.blurb}</p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {THEMES.map((option) => (
            <Choice key={option.name} selected={theme === option.name} label={option.label} onSelect={() => setAppearance({ theme: option.name })}>
              <div className="flex flex-1 items-end gap-1.5 p-2" style={{ background: option.swatch.canvas }}>
                <div className="h-3 flex-1 rounded-sm opacity-10" style={{ background: option.swatch.ink }} />
                <div className="size-5 rounded-full" style={{ background: option.swatch.brand }} />
              </div>
            </Choice>
          ))}
        </div>
      </section>
      <ChatActivitySettings {...activity} />
    </SettingsPage>
  );
}
