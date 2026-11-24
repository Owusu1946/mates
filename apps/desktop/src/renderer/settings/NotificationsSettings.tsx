import { Switch } from "../components/ui/Switch.tsx";
import { setPreference, usePreferences } from "./preferences.ts";
import { Group, Row, SettingsPage } from "./SettingsParts.tsx";

/** When Mates tells you something on this computer, and how quietly. */
export function NotificationsSettings() {
  const { notifications } = usePreferences();
  const set = (change: Partial<typeof notifications>) => setPreference("notifications", change);
  return (
    <SettingsPage title="Notifications" description="When this computer lets you know, even with the window closed.">
      <Group title="Tell me when">
        <Row label="A mate needs you" hint="An OK, a sign-in or a question">
          <Switch label="A mate needs you" on={notifications.needsYou} onChange={(needsYou) => set({ needsYou })} />
        </Row>
        <Row label="A mate is done" hint="With what it did">
          <Switch label="A mate is done" on={notifications.done} onChange={(done) => set({ done })} />
        </Row>
        <Row label="A friend's mate asks something">
          <Switch label="Friends" on={notifications.friends} onChange={(friends) => set({ friends })} />
        </Row>
      </Group>
      <Group>
        <Row label="Play a sound">
          <Switch label="Play a sound" on={notifications.sound} onChange={(sound) => set({ sound })} />
        </Row>
        <Row label="Quiet at night" hint="Nothing between 10 pm and 7 am, except what needs you">
          <Switch label="Quiet at night" on={notifications.quietHours} onChange={(quietHours) => set({ quietHours })} />
        </Row>
      </Group>
    </SettingsPage>
  );
}
