import { useState } from "react";
import { MateAvatar } from "../chat/MateAvatar.tsx";
import { Button } from "../components/ui/Button.tsx";
import { Icon, type IconName } from "../components/ui/Icon.tsx";
import { Switch } from "../components/ui/Switch.tsx";
import type { Mate } from "../data/sampleCrew.ts";
import { tickTextContent } from "../lib/tickTextContent.ts";
import { cn } from "../lib/utils.ts";
import { goalOf, liveGoal, queuedGoals, type ComputerAction, type ComputerPlace, type ComputerState, type Goal } from "./computer.logic.ts";
import { ComputerScreen } from "./ComputerScreen.tsx";
import { taskFor } from "./useComputers.ts";

const PLACES: { value: ComputerPlace; label: string; icon: IconName }[] = [
  { value: "cloud", label: "Cloud computer", icon: "globe" },
  { value: "thisPC", label: "This PC", icon: "monitor" },
];

/** What the phone shows while it starts (apps/mobile/app/(app)/computer.tsx). */
const BOOT_STEPS = [
  { at: 0, label: "Waking your computer" },
  { at: 1, label: "Powering on" },
  { at: 2, label: "Starting the desktop" },
  { at: 3, label: "Almost there" },
];

const WAITING_TITLE = { approval: "Your OK is needed", login: "Sign in to continue", question: "A quick question" } as const;

/** Starting up: the boot steps, written in place each second so nothing re-renders. */
function Boot() {
  const [since] = useState(() => Date.now());
  return (
    <>
      <span className="size-5 animate-spin rounded-full border-2 border-ink-soft border-r-transparent" />
      <p className="text-sm text-ink-soft" ref={tickTextContent((now) => [...BOOT_STEPS].reverse().find((step) => (now - since) / 1000 >= step.at)!.label, true)} />
    </>
  );
}

/** A goal stopped for you: your OK, a sign-in you do yourself, or a question to answer. */
function Waiting({ goal, mate, youHaveTheMouse, dispatch }: { goal: Goal; mate: Mate; youHaveTheMouse: boolean; dispatch: (action: ComputerAction) => void }) {
  const [reply, setReply] = useState("");
  const kind = goal.waitingFor;
  if (!kind || kind === "user_control") return null;
  const step = goal.steps[goal.shown - 1];
  return (
    <div className="animate-fade rounded-xl border border-caution/40 bg-caution-surface p-3">
      <div className="flex items-center gap-2 text-2xs font-medium text-caution-ink">
        <span className="size-1.5 rounded-full bg-caution" />
        {WAITING_TITLE[kind]}
      </div>
      <p className="mt-1.5 text-sm font-semibold">{step?.needs?.title}</p>
      <p className="mt-0.5 text-xs text-ink-soft">{step?.needs?.detail}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {kind === "approval" && (
          <>
            <Button size="sm" onClick={() => dispatch({ type: "answer", allow: true })}>
              Allow
            </Button>
            <Button size="sm" variant="ghost" onClick={() => dispatch({ type: "answer", allow: false })}>
              Not now
            </Button>
          </>
        )}
        {kind === "login" &&
          (youHaveTheMouse ? (
            <Button size="sm" onClick={() => dispatch({ type: "handBack" })}>
              I've signed in, hand back to {mate.name}
            </Button>
          ) : (
            <Button size="sm" icon="hand" onClick={() => dispatch({ type: "takeOver" })}>
              Take over to sign in
            </Button>
          ))}
        {kind === "question" && (
          <form
            className="flex w-full gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (reply.trim()) dispatch({ type: "answer", allow: true });
            }}
          >
            <input value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Your answer" className="h-8 min-w-0 flex-1 rounded-control border border-field-line bg-raised px-2.5 text-sm outline-none focus:border-brand" />
            <Button size="sm" type="submit" disabled={!reply.trim()}>
              Send
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

/** Where your computer is: the app's cloud computer, or this PC (lending, from the desktop plan). */
function PlaceSettings({ place, onPlace }: { place: ComputerPlace; onPlace: (place: ComputerPlace) => void }) {
  // UI only: what you'd grant on this PC.
  const [grants, setGrants] = useState({ screen: true, control: false, askNewApps: true });
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">Where your mates work</h3>
      <div role="radiogroup" aria-label="Where your mates work" className="grid grid-cols-2 gap-1 rounded-xl bg-soft p-1">
        {PLACES.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={place === option.value}
            onClick={() => onPlace(option.value)}
            className="flex h-10 items-center justify-center gap-2 rounded-lg text-sm text-ink-soft outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-brand aria-checked:bg-raised aria-checked:text-ink aria-checked:shadow-xs [&_svg]:size-4"
          >
            <Icon name={option.icon} />
            {option.label}
          </button>
        ))}
      </div>
      {place === "cloud" ? (
        <div className="flex flex-col gap-2.5 rounded-xl border border-line p-3.5">
          <p className="text-sm text-ink-soft">A desktop of your own in the cloud, with Chrome, documents and files. Your mates use it for you, and you can too. It keeps your sign-ins and files, and turns off after 5 minutes with nothing to do.</p>
          <div>
            <div className="mb-1 flex justify-between text-xs">
              <span>This month · Pro</span>
              <span className="text-ink-soft tabular-nums">1h 50m of 3h left</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-hover-fill">
              <div className="h-full w-[39%] rounded-full bg-brand" />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border border-line p-3.5">
          <p className="text-sm text-ink-soft">Your mates use your apps and logins on this PC instead. You see everything they do, and moving your mouse or typing pauses them at once.</p>
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
    </section>
  );
}

type ComputerPanelProps = {
  state: ComputerState;
  dispatch: (action: ComputerAction) => void;
  mates: Record<string, Mate>;
  /** The mate whose chat is open, offered the computer when it isn't already in line. */
  chatMate: Mate;
};

/**
 * Your computer beside the chat. One desktop your mates share (apps/api/src/computers.ts): who's
 * using it now, its screen, live, with Take over and Turn off; anything waiting on you; who's next
 * in line; and where it is. The same in every chat, because it's the same computer.
 */
export function ComputerPanel({ state, dispatch, mates, chatMate }: ComputerPanelProps) {
  const [confirmOff, setConfirmOff] = useState(false);
  const live = liveGoal(state);
  const driver = live ? mates[live.mateId] : undefined;
  const queue = queuedGoals(state);
  const youHaveTheMouse = state.controller === "user";
  const chatMateGoal = goalOf(state, chatMate.id);
  const step = live && live.shown > 0 ? live.steps[live.shown - 1] : undefined;
  const ask = () => dispatch({ type: "ask", goal: { id: `goal-${chatMate.id}-${Date.now()}`, mateId: chatMate.id, ...taskFor(chatMate.id) } });

  const status =
    state.power === "off" ? { text: "Off", tone: "bg-ink-soft" }
    : state.power === "starting" ? { text: "Starting", tone: "status-pulse bg-brand" }
    : state.power === "stopping" ? { text: "Turning off", tone: "status-pulse bg-ink-soft" }
    : youHaveTheMouse ? { text: "You have the mouse", tone: "bg-brand" }
    : live?.status === "waiting" ? { text: `${driver?.name ?? "Your mate"} needs you`, tone: "status-pulse bg-caution" }
    : driver ? { text: `${driver.name} is using it`, tone: "status-pulse bg-ok" }
    : { text: "On", tone: "bg-ok" };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{state.place === "thisPC" ? "This PC" : "Your computer"}</h3>
          <span className="flex items-center gap-1.5 text-xs text-ink-soft">
            <span className={cn("size-1.5 rounded-full", status.tone)} />
            {status.text}
          </span>
        </div>

        <div className="aspect-[16/10] w-full">
          {state.power === "on" && step && driver ? (
            <ComputerScreen mate={driver} step={step} driving={youHaveTheMouse} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 rounded-lg border border-line bg-soft px-6 text-center">
              {state.power === "starting" ? (
                <Boot />
              ) : state.power === "stopping" ? (
                <>
                  <span className="size-5 animate-spin rounded-full border-2 border-ink-soft border-r-transparent" />
                  <p className="text-sm text-ink-soft">Turning off… Your files and sign-ins are kept for next time.</p>
                </>
              ) : state.power === "on" ? (
                <p className="text-sm text-ink-soft">{driver ? `${driver.name} is getting started…` : "On and ready. Your mates use it when a job needs a computer."}</p>
              ) : (
                <>
                  <Icon name="monitor" size={28} className="text-ink-soft" />
                  <p className="text-sm text-ink-soft">Your mates use it for you, and you can too.</p>
                  <Button size="sm" icon="play" onClick={() => dispatch({ type: "turnOn" })}>
                    Turn on your computer
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {state.power === "on" && (
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant={youHaveTheMouse ? "default" : "outline"} icon="hand" onClick={() => dispatch({ type: youHaveTheMouse ? "handBack" : "takeOver" })}>
              {youHaveTheMouse ? (driver ? `Hand back to ${driver.name}` : "Hand back") : "Take over"}
            </Button>
            {live && !youHaveTheMouse && (
              <Button size="sm" variant="ghost" icon="square" onClick={() => dispatch({ type: "cancel", goalId: live.id })}>
                Stop this task
              </Button>
            )}
            <div className="flex-1" />
            {confirmOff ? (
              <span className="flex animate-fade items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => setConfirmOff(false)}>
                  Keep it on
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setConfirmOff(false);
                    dispatch({ type: "turnOff" });
                  }}
                >
                  Turn off
                </Button>
              </span>
            ) : (
              <Button size="sm" variant="ghost-muted" icon="x" onClick={() => setConfirmOff(true)}>
                Turn off
              </Button>
            )}
          </div>
        )}

        {youHaveTheMouse && live?.waitingFor === "user_control" && (
          <p className="text-xs text-ink-soft">You have the mouse. Click and type on the screen; {driver?.name ?? "your mate"} waits until you hand back, and never sees what you type.</p>
        )}
        {live && driver && <Waiting goal={live} mate={driver} youHaveTheMouse={youHaveTheMouse} dispatch={dispatch} />}

        {!chatMateGoal && state.power !== "stopping" && (
          <Button variant="secondary" size="sm" onClick={ask}>
            <MateAvatar mate={{ ...chatMate, status: "idle" }} size={16} still />
            Ask {chatMate.name} to {taskFor(chatMate.id).title.charAt(0).toLowerCase() + taskFor(chatMate.id).title.slice(1)}
          </Button>
        )}
      </section>

      {live && driver && live.shown > 0 && (
        <section className="flex flex-col gap-1.5">
          <h3 className="text-sm font-semibold">
            {driver.name}: {live.title}
          </h3>
          <ol className="flex flex-col">
            {live.steps.slice(0, live.shown).map((done, index) => (
              <li key={done.id} className="flex min-h-7 items-center gap-2.5 text-sm">
                <span className={cn("size-1.5 shrink-0 rounded-full", index === live.shown - 1 && live.status === "running" ? "status-pulse bg-brand" : "bg-ink-soft/50")} />
                <span className={index === live.shown - 1 ? "text-ink" : "text-ink-soft"}>{done.label}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {queue.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h3 className="text-sm font-semibold">Next in line</h3>
          {queue.map((goal) => {
            const mate = mates[goal.mateId];
            return (
              <div key={goal.id} className="flex items-center gap-2.5 rounded-lg px-1 py-1.5">
                {mate && <MateAvatar mate={{ ...mate, status: "idle" }} size={22} />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{goal.title}</div>
                  <div className="text-2xs text-ink-soft">{mate?.name} · waits for the computer</div>
                </div>
                <Button variant="ghost-muted" size="icon-xs" icon="x" aria-label="Remove from the line" onClick={() => dispatch({ type: "cancel", goalId: goal.id })} />
              </div>
            );
          })}
        </section>
      )}

      <PlaceSettings place={state.place} onPlace={(place) => dispatch({ type: "place", place })} />
    </div>
  );
}
