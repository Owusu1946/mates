import { useState } from "react";
import { Button } from "../components/ui/Button.tsx";
import { Switch } from "../components/ui/Switch.tsx";
import { PERMISSIONS } from "../data/sampleSettings.ts";
import { setPreference, usePreferences } from "./preferences.ts";
import { Group, Row, Select, SettingsPage } from "./SettingsParts.tsx";

const BRIEF_TIMES = ["6:00", "6:30", "7:00", "7:30", "8:00", "8:30", "9:00"].map((time) => ({ value: time, label: time }));

/**
 * What your mates notice and may do without asking, and your morning brief, as the phone's
 * Settings has them (morning brief, what I've noticed, permissions). Memory has its own page.
 */
export function MatesSettings() {
  const { noticed, brief } = usePreferences();
  const [permissions, setPermissions] = useState(PERMISSIONS);
  return (
    <SettingsPage title="Mates" description="Your morning brief, what your mates pick up, and what they may do without asking.">
      <Group title="Morning brief" description="Your day in one message: calendar, email, the light schedule, commute and bills.">
        <Row label="Send my morning brief">
          <Switch label="Morning brief" on={brief.on} onChange={(on) => setPreference("brief", { on })} />
        </Row>
        {brief.on && (
          <>
            <Row label="Time">
              <Select label="Time" value={brief.time} options={BRIEF_TIMES} onChange={(time) => setPreference("brief", { time })} />
            </Row>
            <Row label="On weekends too">
              <Switch label="On weekends" on={brief.weekends} onChange={(weekends) => setPreference("brief", { weekends })} />
            </Row>
          </>
        )}
      </Group>

      <Group title="What your mates notice" description="Habits they pick up, so they can offer to handle them.">
        <Row label="Learn my habits" hint="Like a weekly call or a regular order">
          <Switch label="Learn my habits" on={noticed.habits} onChange={(habits) => setPreference("noticed", { habits })} />
        </Row>
        <Row label="Learn from my apps" hint="Patterns in your email and calendar">
          <Switch label="Learn from my apps" on={noticed.apps} onChange={(apps) => setPreference("noticed", { apps })} />
        </Row>
        <Row label="Meeting prep" hint="A short brief before meetings">
          <Switch label="Meeting prep" on={noticed.meetingPrep} onChange={(meetingPrep) => setPreference("noticed", { meetingPrep })} />
        </Row>
      </Group>

      <Group title="Allowed without asking" description="Your mates act on what you ask. These they may also do on their own.">
        {permissions.length === 0 ? (
          <Row label="Nothing allowed yet" hint="When a mate asks and you say always, it shows here." />
        ) : (
          permissions.map((permission) => (
            <Row key={permission.id} label={`${permission.verb}${permission.target ? ` to ${permission.target}` : ""}`} hint={permission.app}>
              <Button size="xs" variant="ghost" onClick={() => setPermissions(permissions.filter((candidate) => candidate.id !== permission.id))}>
                Remove
              </Button>
            </Row>
          ))
        )}
      </Group>
    </SettingsPage>
  );
}
