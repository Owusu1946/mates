import { useEffect, useState } from "react";
import { Switch } from "../components/ui/Switch.tsx";
import { shortcutLabel } from "./preferences.logic.ts";
import { setPreference, usePreferences } from "./preferences.ts";
import { Group, Row, Select, SettingsPage } from "./SettingsParts.tsx";

const PLATFORM = window.mates.platform;

/** How Mates behaves on this computer: starting, closing, the summon bar and the notch. */
export function ComputerSettings() {
  const { desktop, privacy } = usePreferences();
  const [choices, setChoices] = useState<string[]>([desktop.summonShortcut]);
  useEffect(() => {
    let live = true;
    window.mates.appInfo().then((info) => live && setChoices(info.shortcutChoices));
    return () => {
      live = false;
    };
  }, []);
  const set = (change: Partial<typeof desktop>) => setPreference("desktop", change);
  return (
    <SettingsPage title="This computer" description="How Mates starts, stays and shows up here.">
      <Group>
        <Row label="Open at login" hint="Start Mates when you sign in to this computer">
          <Switch label="Open at login" on={desktop.openAtLogin} onChange={(openAtLogin) => set({ openAtLogin })} />
        </Row>
        {PLATFORM !== "darwin" && (
          <Row label="Keep running when closed" hint="Mates stays in the tray so your mates can reach you">
            <Switch label="Keep running when closed" on={desktop.keepRunning} onChange={(keepRunning) => set({ keepRunning })} />
          </Row>
        )}
      </Group>

      <Group title="Summon bar" description="Ask a mate from anywhere, without opening the window.">
        <Row label="Shortcut">
          <Select
            label="Summon shortcut"
            value={desktop.summonShortcut}
            options={choices.map((choice) => ({ value: choice, label: shortcutLabel(choice, PLATFORM) }))}
            onChange={(summonShortcut) => set({ summonShortcut })}
          />
        </Row>
        {PLATFORM === "darwin" && (
          <Row label="Live in the notch" hint="Show what your mates are doing around the notch">
            <Switch label="Live in the notch" on={desktop.notch} onChange={(notch) => set({ notch })} />
          </Row>
        )}
      </Group>

      <Group title="Privacy">
        <Row label="Let mates see my screen" hint="Only when you ask about what's on it. Off until you turn it on.">
          <Switch label="Let mates see my screen" on={privacy.snapshot} onChange={(snapshot) => setPreference("privacy", { snapshot })} />
        </Row>
      </Group>
    </SettingsPage>
  );
}
