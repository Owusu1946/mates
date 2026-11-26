import { useUser } from "@clerk/electron/react";
import { useState } from "react";
import { Button } from "../components/ui/Button.tsx";
import { Icon } from "../components/ui/Icon.tsx";
import { DEVICES } from "../data/sampleSettings.ts";
import { Group, Row, SettingsPage } from "./SettingsParts.tsx";

/** You: your name and email, the devices you're signed in on, signing out, and deleting your account. */
export function AccountSettings({ you, onSignOut }: { you: string; onSignOut: () => void }) {
  const { user } = useUser();
  const [devices, setDevices] = useState(DEVICES);
  const [deleting, setDeleting] = useState(false);
  return (
    <SettingsPage title="Account" description="Who you are on Mates, and where you're signed in.">
      <Group>
        <Row label={you} hint={user?.primaryEmailAddress?.emailAddress}>
          <span className="flex size-9 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-ink">{you.charAt(0).toUpperCase()}</span>
        </Row>
      </Group>

      <Group title="Devices" description="Your mates and chats are the same on each.">
        {devices.map((device) => (
          <Row
            key={device.id}
            label={
              <span className="flex items-center gap-2">
                <Icon name={device.kind === "phone" ? "phone" : "monitor"} size={15} className="text-ink-soft" />
                {device.name}
              </span>
            }
            hint={device.detail}
          >
            {device.current ? (
              <span className="text-xs text-ink-soft">This device</span>
            ) : (
              <Button size="xs" variant="ghost" onClick={() => setDevices(devices.filter((candidate) => candidate.id !== device.id))}>
                Sign out
              </Button>
            )}
          </Row>
        ))}
      </Group>

      <Group>
        <Row label="Sign out" hint="Your mates keep working; sign back in any time.">
          <Button size="sm" variant="outline" onClick={onSignOut}>
            Sign out
          </Button>
        </Row>
        <Row label="Delete account" hint={deleting ? "This deletes your mates, chats and memories for good. It can't be undone." : "Everything goes: your mates, chats and memories."}>
          {deleting ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => setDeleting(false)}>
                Keep it
              </Button>
              <Button size="sm" variant="outline" className="text-danger-ink" onClick={onSignOut}>
                Delete
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" className="text-danger-ink" onClick={() => setDeleting(true)}>
              Delete…
            </Button>
          )}
        </Row>
      </Group>
    </SettingsPage>
  );
}
