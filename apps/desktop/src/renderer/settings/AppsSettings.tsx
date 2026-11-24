import { useState } from "react";
import { Button } from "../components/ui/Button.tsx";
import { APPS } from "../data/sampleSettings.ts";
import { Group, Row, SettingsPage } from "./SettingsParts.tsx";

/** The apps your mates can use for you, as the phone's Settings → Apps: connect and disconnect. */
export function AppsSettings() {
  const [apps, setApps] = useState(APPS);
  const toggle = (id: string) => setApps(apps.map((app) => (app.id === id ? { ...app, connected: !app.connected } : app)));
  const connected = apps.filter((app) => app.connected);
  const others = apps.filter((app) => !app.connected);
  return (
    <SettingsPage title="Apps" description="Connect an app and your mates can use it for you. They only use what you ask.">
      {connected.length > 0 && (
        <Group title="Connected">
          {connected.map((app) => (
            <Row key={app.id} label={app.name} hint={app.what}>
              <Button size="xs" variant="ghost" onClick={() => toggle(app.id)}>
                Disconnect
              </Button>
            </Row>
          ))}
        </Group>
      )}
      <Group title="More apps">
        {others.map((app) => (
          <Row key={app.id} label={app.name} hint={app.what}>
            <Button size="xs" variant="outline" onClick={() => toggle(app.id)}>
              Connect
            </Button>
          </Row>
        ))}
      </Group>
    </SettingsPage>
  );
}
