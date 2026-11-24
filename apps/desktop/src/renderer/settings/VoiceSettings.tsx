import { Kbd, MOD } from "../components/ui/Kbd.tsx";
import { Switch } from "../components/ui/Switch.tsx";
import { setPreference, usePreferences } from "./preferences.ts";
import { Group, Row, SettingsPage } from "./SettingsParts.tsx";

const SHORTCUTS = [
  { label: "Search and commands", keys: `${MOD} K` },
  { label: "New mate", keys: `${MOD} N` },
  { label: "Settings", keys: `${MOD} ,` },
  { label: "Move between areas", keys: "F6" },
];

/** Talking to your mates, and the keys worth knowing. */
export function VoiceSettings() {
  const { voice } = usePreferences();
  return (
    <SettingsPage title="Keyboard & voice" description="Talk to a mate instead of typing, and the keys that get you around.">
      <Group title="Voice">
        <Row label="Hold Space to talk" hint="In the summon bar, with the field empty. Let go to send.">
          <Switch label="Hold Space to talk" on={voice.holdSpace} onChange={(holdSpace) => setPreference("voice", { holdSpace })} />
        </Row>
        <Row label="Captions on calls">
          <Switch label="Captions on calls" on={voice.captions} onChange={(captions) => setPreference("voice", { captions })} />
        </Row>
      </Group>
      <Group title="Shortcuts">
        {SHORTCUTS.map((shortcut) => (
          <Row key={shortcut.label} label={shortcut.label}>
            <Kbd>{shortcut.keys}</Kbd>
          </Row>
        ))}
      </Group>
    </SettingsPage>
  );
}
