import { useEffect, useState } from "react";
import { Switch } from "../components/ui/Switch.tsx";
import { setPreference, usePreferences } from "./preferences.ts";
import { Group, Row, SettingsPage } from "./SettingsParts.tsx";

/** The version you're on and how it updates. */
export function AboutSettings() {
  const { updates } = usePreferences();
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    window.mates.appInfo().then((info) => live && setVersion(info.version));
    return () => {
      live = false;
    };
  }, []);
  return (
    <SettingsPage title="About" description={version ? `Mates for desktop ${version}` : "Mates for desktop"}>
      <Group title="Updates">
        <Row label="Update automatically" hint="Installs when you next open Mates">
          <Switch label="Update automatically" on={updates.automatic} onChange={(automatic) => setPreference("updates", { automatic })} />
        </Row>
        <Row label="Try new things early" hint="Beta versions, a little rougher">
          <Switch label="Beta versions" on={updates.beta} onChange={(beta) => setPreference("updates", { beta })} />
        </Row>
      </Group>
    </SettingsPage>
  );
}
