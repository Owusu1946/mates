import { useState } from "react";
import { AppLogo } from "../components/AppLogo.tsx";
import { Button } from "../components/ui/Button.tsx";
import { Icon } from "../components/ui/Icon.tsx";
import { Menu, MenuItem } from "../components/ui/Menu.tsx";
import { cn } from "../lib/utils.ts";
import { appState, filterApps, STATE_LABEL, type AppConnection } from "./apps.logic.ts";
import { cancelConnect, connectApp, disconnectApp, useApps } from "./apps.ts";
import { SettingsPage } from "./SettingsParts.tsx";

/** A page of apps at a time, as the API pages them. */
const PAGE = 12;

/**
 * The apps your mates can use for you, as the phone's Settings → Apps: find one, connect it in
 * your browser, disconnect it. What needs you (a sign-in that expired) comes first.
 */
export function AppsSettings() {
  const apps = useApps();
  const [search, setSearch] = useState("");
  const [connectedOnly, setConnectedOnly] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const listed = filterApps(apps, search, connectedOnly);
  const connectedCount = apps.filter((app) => app.connected).length;
  const visible = listed.slice(0, shown);

  return (
    <SettingsPage title="Apps" description="Connect an app and your mates can use it for you. They only use one when you ask.">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-field-line bg-canvas px-3 transition-shadow has-focus-visible:border-brand has-focus-visible:ring-[3px] has-focus-visible:ring-brand/20 dark:bg-field-line/30">
            <Icon name="search" size={15} className="text-ink-soft" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setShown(PAGE);
              }}
              onKeyDown={(event) => event.key === "Escape" && search && (event.stopPropagation(), setSearch(""))}
              placeholder="Find an app"
              aria-label="Find an app"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-soft/80"
            />
            {search && (
              <button type="button" aria-label="Clear search" onClick={() => setSearch("")} className="text-ink-soft hover:text-ink">
                <Icon name="x" size={14} />
              </button>
            )}
          </label>
          <div role="radiogroup" aria-label="Show" className="flex h-9 shrink-0 rounded-lg bg-soft p-0.5 text-sm">
            {[false, true].map((connected) => (
              <button
                key={String(connected)}
                type="button"
                role="radio"
                aria-checked={connectedOnly === connected}
                onClick={() => {
                  setConnectedOnly(connected);
                  setShown(PAGE);
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 font-medium transition-[background-color,color,box-shadow] duration-150",
                  connectedOnly === connected ? "bg-raised text-ink shadow-xs" : "text-ink-soft hover:text-ink",
                )}
              >
                {connected ? "Connected" : "All apps"}
                {connected && connectedCount > 0 && <span className="text-xs text-ink-soft tabular-nums">{connectedCount}</span>}
              </button>
            ))}
          </div>
        </div>

        {visible.length > 0 ? (
          <ul key={`${connectedOnly}`} className="motion-swap grid gap-2 sm:grid-cols-2">
            {visible.map((app) => (
              <AppTile key={app.slug} app={app} />
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-line py-10 text-center">
            <Icon name="grid" size={20} className="text-ink-soft" />
            <p className="text-sm font-medium">{search ? `No apps match “${search.trim()}”` : "Nothing connected yet"}</p>
            <p className="max-w-72 text-xs text-ink-soft">{search ? "Try another name, or ask a mate: they can often help without one." : "Connect one and your mates can use it when you ask."}</p>
            {!search && (
              <Button size="sm" variant="outline" className="mt-2" onClick={() => setConnectedOnly(false)}>
                Browse all apps
              </Button>
            )}
          </div>
        )}

        {listed.length > shown && (
          <Button variant="ghost" size="sm" className="self-center" onClick={() => setShown(shown + PAGE)}>
            Show more
            <span className="text-ink-soft tabular-nums">{listed.length - shown}</span>
          </Button>
        )}
      </div>
    </SettingsPage>
  );
}

function AppTile({ app }: { app: AppConnection }) {
  const state = appState(app);
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <li className="flex min-h-16 items-center gap-3 rounded-xl border border-line bg-raised px-3 py-2.5">
        <AppLogo name={app.name} slug={app.slug} logo={app.logo} size={34} />
        <p className="min-w-0 flex-1 text-sm leading-snug">
          Disconnect {app.name}?<span className="block text-xs text-ink-soft">Mates can't use it until you connect again.</span>
        </p>
        <Button size="xs" variant="ghost" onClick={() => setConfirming(false)}>
          Keep
        </Button>
        <Button
          size="xs"
          variant="outline"
          className="text-danger-ink"
          onClick={() => {
            disconnectApp(app.slug);
            setConfirming(false);
          }}
        >
          Disconnect
        </Button>
      </li>
    );
  }

  return (
    <li
      className={cn(
        "group flex min-h-16 items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors duration-150",
        state === "reconnect" ? "border-caution/40 bg-caution-surface" : "border-line hover:bg-hover-fill",
      )}
    >
      <AppLogo name={app.name} slug={app.slug} logo={app.logo} size={34} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{app.name}</p>
        <p
          className={cn(
            "flex items-center gap-1.5 text-xs",
            state === "connected" ? "text-ok-ink" : state === "reconnect" ? "text-caution-ink" : "text-ink-soft",
          )}
        >
          {state === "connected" && <span className="size-1.5 rounded-full bg-ok" />}
          {state === "connecting" && <span className="size-3 animate-spin rounded-full border-[1.5px] border-current border-r-transparent" />}
          {STATE_LABEL[state]}
        </p>
      </div>
      {state === "available" && (
        <Button size="xs" variant="outline" onClick={() => connectApp(app.slug)}>
          Connect
        </Button>
      )}
      {state === "reconnect" && (
        <Button size="xs" variant="outline" onClick={() => connectApp(app.slug)}>
          Reconnect
        </Button>
      )}
      {state === "connecting" && (
        <Button size="xs" variant="ghost" onClick={() => cancelConnect(app.slug)}>
          Cancel
        </Button>
      )}
      {state === "connected" && (
        <Menu
          align="end"
          trigger={
            <Button size="icon-xs" variant="ghost-muted" aria-label={`${app.name} options`} className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100">
              <Icon name="more" />
            </Button>
          }
        >
          <MenuItem icon="x" className="text-danger-ink" onClick={() => setConfirming(true)}>
            Disconnect
          </MenuItem>
        </Menu>
      )}
    </li>
  );
}
