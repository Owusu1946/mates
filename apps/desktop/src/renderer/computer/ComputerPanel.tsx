import { useState } from "react";
import { MateAvatar } from "../chat/MateAvatar.tsx";
import { Button } from "../components/ui/Button.tsx";
import { Icon, type IconName } from "../components/ui/Icon.tsx";
import type { Mate } from "../data/sampleCrew.ts";
import { cn } from "../lib/utils.ts";
import type { ComputerAction, ComputerPlace, ComputerState } from "./computer.logic.ts";
import { ComputerScreen } from "./ComputerScreen.tsx";
import { taskFor } from "./useComputers.ts";

const PLACES: { value: ComputerPlace; label: string; icon: IconName }[] = [
  { value: "cloud", label: "Cloud computer", icon: "globe" },
  { value: "thisPC", label: "This PC", icon: "monitor" },
  { value: "off", label: "Off", icon: "x" },
];

const POWER_TEXT = { asleep: "Asleep", starting: "Starting…", working: "Working", paused: "Paused", done: "Done" } as const;

function Switch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150", on ? "bg-brand" : "bg-field-line")}>
      <span className={cn("absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-xs transition-[translate] duration-150 ease-out-soft", on && "translate-x-4")} />
    </button>
  );
}

/** Where the mate works, and what each choice means for you. */
function PlaceSettings({ mate, place, onPlace }: { mate: Mate; place: ComputerPlace; onPlace: (place: ComputerPlace) => void }) {
  // UI only: what you'd grant on this PC.
  const [grants, setGrants] = useState({ screen: true, control: false, askNewApps: true });
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">Where {mate.name} works</h3>
      <div role="radiogroup" aria-label={`Where ${mate.name} works`} className="grid grid-cols-3 gap-1 rounded-xl bg-soft p-1">
        {PLACES.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={place === option.value}
            onClick={() => onPlace(option.value)}
            className="flex h-14 flex-col items-center justify-center gap-1 rounded-lg text-xs text-ink-soft outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-brand aria-checked:bg-raised aria-checked:text-ink aria-checked:shadow-xs"
          >
            <Icon name={option.icon} size={16} />
            {option.label}
          </button>
        ))}
      </div>
      {place === "cloud" && (
        <div className="flex flex-col gap-2.5 rounded-xl border border-line p-3.5">
          <p className="text-sm text-ink-soft">A private computer in the cloud with its own browser. Nothing on yours is touched, and it keeps working when this PC is off.</p>
          <div>
            <div className="mb-1 flex justify-between text-xs">
              <span>This month</span>
              <span className="text-ink-soft tabular-nums">1h 50m of 3h left</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-hover-fill">
              <div className="h-full w-[39%] rounded-full bg-brand" />
            </div>
          </div>
        </div>
      )}
      {place === "thisPC" && (
        <div className="flex flex-col gap-3 rounded-xl border border-line p-3.5">
          <p className="text-sm text-ink-soft">
            {mate.name} uses your apps and logins on this PC. You see everything it does, and moving your mouse or typing pauses it at once.
          </p>
          {[
            { key: "screen", label: "See the screen", detail: "To read what's on it" },
            { key: "control", label: "Use mouse and keyboard", detail: "To click and type for you" },
            { key: "askNewApps", label: "Ask before a new app", detail: "Chrome, Mail and Notes are allowed" },
          ].map((grant) => (
            <div key={grant.key} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm">{grant.label}</div>
                <div className="text-2xs text-ink-soft">{grant.detail}</div>
              </div>
              <Switch label={grant.label} on={grants[grant.key as keyof typeof grants]} onChange={(on) => setGrants({ ...grants, [grant.key]: on })} />
            </div>
          ))}
        </div>
      )}
      {place === "off" && <p className="rounded-xl border border-line p-3.5 text-sm text-ink-soft">{mate.name} won't use a computer, and will ask you to do anything that needs one.</p>}
    </section>
  );
}

/**
 * A mate's computer beside its chat: its screen, live, with what it's doing; take over, pause or
 * stop at any time; what it's done so far; and where it works. A step that spends money waits
 * for your OK here.
 */
export function ComputerPanel({ mate, state, dispatch }: { mate: Mate; state: ComputerState; dispatch: (action: ComputerAction) => void }) {
  const task = taskFor(mate.id);
  const done = task.steps.slice(0, state.shown);
  const current = done.at(-1);
  const waiting = state.waitingOn ? task.steps.find((step) => step.id === state.waitingOn) : undefined;
  const live = state.power === "working" || state.power === "paused" || state.power === "done";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <MateAvatar mate={{ ...mate, status: state.power === "working" && !state.takenOver ? "working" : state.power === "starting" ? "thinking" : "idle" }} size={22} />
          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{state.place === "thisPC" ? "Your screen" : `${mate.name}'s computer`}</h3>
          <span className={cn("flex items-center gap-1.5 text-xs", state.power === "working" ? "text-ok-ink" : "text-ink-soft")}>
            <span className={cn("size-1.5 rounded-full", state.power === "working" ? "status-pulse bg-ok" : state.power === "starting" ? "status-pulse bg-brand" : "bg-ink-soft")} />
            {state.takenOver ? "You're driving" : POWER_TEXT[state.power]}
          </span>
        </div>

        <div className="aspect-[16/10] w-full">
          {state.place === "off" ? (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-line text-sm text-ink-soft">The computer is off.</div>
          ) : live && current ? (
            <ComputerScreen mate={mate} step={current} driving={state.takenOver} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 rounded-lg border border-line bg-soft text-center">
              {state.power === "starting" ? (
                <>
                  <span className="size-5 animate-spin rounded-full border-2 border-ink-soft border-r-transparent" />
                  <p className="text-sm text-ink-soft">Starting {state.place === "thisPC" ? "on this PC" : `${mate.name}'s computer`}…</p>
                </>
              ) : (
                <>
                  <MateAvatar mate={{ ...mate, status: "idle" }} size={40} still />
                  <div>
                    <p className="text-sm font-medium">{mate.name}'s computer is asleep</p>
                    <p className="text-xs text-ink-soft">Next: {task.title.toLowerCase()}</p>
                  </div>
                  <Button size="sm" icon="play" onClick={() => dispatch({ type: "wake" })}>
                    Wake it
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {live && (
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant={state.takenOver ? "default" : "outline"} icon="hand" onClick={() => dispatch({ type: state.takenOver ? "handBack" : "takeOver" })}>
              {state.takenOver ? `Hand back to ${mate.name}` : "Take over"}
            </Button>
            {!state.takenOver && state.power !== "done" && (
              <Button size="sm" variant="ghost" icon={state.power === "paused" ? "play" : "pause"} onClick={() => dispatch({ type: state.power === "paused" ? "resume" : "pause" })}>
                {state.power === "paused" ? "Resume" : "Pause"}
              </Button>
            )}
            <div className="flex-1" />
            <Button size="sm" variant="ghost-muted" icon="square" onClick={() => dispatch({ type: "stop" })}>
              Stop
            </Button>
          </div>
        )}

        {waiting?.approval && (
          <div className="animate-fade rounded-xl border border-caution/40 bg-caution-surface p-3">
            <div className="flex items-center gap-2 text-2xs font-medium text-caution-ink">
              <span className="size-1.5 rounded-full bg-caution" />
              Needs your OK
            </div>
            <p className="mt-1.5 text-sm font-semibold">{waiting.approval.title}</p>
            <p className="mt-0.5 text-xs text-ink-soft">{waiting.approval.detail}</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => dispatch({ type: "answer", allow: true })}>
                Allow
              </Button>
              <Button size="sm" variant="ghost" onClick={() => dispatch({ type: "answer", allow: false })}>
                Not now
              </Button>
            </div>
          </div>
        )}
      </section>

      {done.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h3 className="text-sm font-semibold">What {mate.name} did</h3>
          <ol className="flex flex-col">
            {done.map((step, index) => (
              <li key={step.id} className="flex min-h-7 items-center gap-2.5 text-sm">
                <span className={cn("size-1.5 shrink-0 rounded-full", index === done.length - 1 && state.power === "working" ? "status-pulse bg-brand" : "bg-ink-soft/50")} />
                <span className={index === done.length - 1 ? "text-ink" : "text-ink-soft"}>{step.label}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <PlaceSettings mate={mate} place={state.place} onPlace={(place) => dispatch({ type: "place", place })} />
    </div>
  );
}
