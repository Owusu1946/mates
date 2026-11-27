import { useState } from "react";
import { MateAvatar } from "../chat/MateAvatar.tsx";
import { Button } from "../components/ui/Button.tsx";
import { Switch } from "../components/ui/Switch.tsx";
import { TextArea, TextField } from "../components/ui/TextField.tsx";
import type { Mate } from "../data/sampleCrew.ts";
import { ROUTINES, type Routine } from "../data/samplePlaces.ts";
import { cn } from "../lib/utils.ts";
import { nextRun, scheduleText, timeAgo } from "./places.logic.ts";

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WHEN = new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });

const RUN_TONE = { done: "bg-ok", needsYou: "bg-caution", failed: "bg-danger" } as const;

/** One routine, editable: what it does, who does it, when, and how it went before. */
function RoutineDetail({ routine, mates, now, onChange, onDelete }: { routine: Routine; mates: Mate[]; now: number; onChange: (routine: Routine) => void; onDelete: () => void }) {
  const next = nextRun(routine.days, routine.time, routine.on, now);
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5 px-6 py-6">
      {routine.drafted && !routine.on && (
        <p className="rounded-xl border border-brand/30 bg-brand/8 px-3.5 py-2.5 text-sm">Drafted for you · turn it on to start</p>
      )}
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">{routine.name || "New routine"}</h2>
          <p className="text-xs text-ink-soft">{routine.on ? (next ? `Next: ${WHEN.format(next)}` : scheduleText(routine.days, routine.time)) : "Off"}</p>
        </div>
        <Switch label="Routine on" on={routine.on} onChange={(on) => onChange({ ...routine, on, drafted: false })} />
      </div>

      <TextField label="Name" placeholder="Name, e.g. Morning briefing" maxLength={60} value={routine.name} onChange={(event) => onChange({ ...routine, name: event.target.value })} />
      <TextArea label="What to do" rows={3} placeholder="What should your mate do each time?" value={routine.task} onChange={(event) => onChange({ ...routine, task: event.target.value })} />

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Who does it</legend>
        <div className="flex flex-wrap gap-1.5">
          {mates.map((mate) => (
            <button
              key={mate.id}
              type="button"
              aria-pressed={routine.mateId === mate.id}
              onClick={() => onChange({ ...routine, mateId: mate.id })}
              className="flex h-9 items-center gap-2 rounded-full border border-line ps-1.5 pe-3 text-sm transition-colors hover:bg-hover-fill aria-pressed:border-brand aria-pressed:bg-soft"
            >
              <MateAvatar mate={{ ...mate, status: "idle" }} size={22} still />
              {mate.name}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">When</legend>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1">
            {DAY_LETTERS.map((letter, day) => (
              <button
                key={DAY_LABELS[day]}
                type="button"
                aria-pressed={routine.days.includes(day)}
                aria-label={DAY_LABELS[day]}
                onClick={() => onChange({ ...routine, days: routine.days.includes(day) ? routine.days.filter((candidate) => candidate !== day) : [...routine.days, day] })}
                className="size-8 rounded-full text-xs font-medium text-ink-soft transition-colors hover:bg-hover-fill aria-pressed:bg-brand aria-pressed:text-brand-ink"
              >
                {letter}
              </button>
            ))}
          </div>
          <input
            type="time"
            aria-label="Time"
            value={routine.time.padStart(5, "0")}
            onChange={(event) => onChange({ ...routine, time: event.target.value.replace(/^0(\d)/, "$1") })}
            className="h-8 rounded-control border border-field-line bg-raised px-2 text-sm outline-none focus:border-brand"
          />
        </div>
        <p className="text-xs text-ink-soft">{scheduleText(routine.days, routine.time)}</p>
      </fieldset>

      <section className="flex flex-col gap-1.5">
        <h3 className="text-sm font-medium">Past runs</h3>
        {routine.runs.length === 0 ? (
          <p className="text-sm text-ink-soft">It hasn't run yet.</p>
        ) : (
          routine.runs.map((run) => (
            <div key={run.at} className="flex items-center gap-2.5 text-sm">
              <span className={cn("size-1.5 shrink-0 rounded-full", RUN_TONE[run.status])} />
              <span className="min-w-0 flex-1 truncate">{run.summary}</span>
              <span className="shrink-0 text-2xs text-ink-soft">{timeAgo(run.at, now)}</span>
            </div>
          ))
        )}
      </section>

      <Button variant="ghost" size="sm" className="self-start text-danger-ink" onClick={onDelete}>
        Delete routine
      </Button>
    </div>
  );
}

/**
 * Things your mates do on a schedule, as on the phone (apps/mobile/app/(app)/routine.tsx): the list
 * on the left with each one's schedule and switch, the one you pick on the right to change.
 */
export function RoutinesPage({ mates }: { mates: Mate[] }) {
  // UI only: the routines live in the page until they reach the API.
  const [routines, setRoutines] = useState(ROUTINES);
  const [selected, setSelected] = useState<string | null>(ROUTINES[0]?.id ?? null);
  const [now] = useState(() => Date.now());
  const routine = routines.find((candidate) => candidate.id === selected);
  const mateById = Object.fromEntries(mates.map((mate) => [mate.id, mate]));
  const update = (next: Routine) => setRoutines(routines.map((candidate) => (candidate.id === next.id ? next : candidate)));

  const create = () => {
    const fresh: Routine = { id: `r-${crypto.randomUUID()}`, name: "", task: "", mateId: mates[0]!.id, days: [1, 2, 3, 4, 5], time: "8:00", on: false, runs: [] };
    setRoutines([fresh, ...routines]);
    setSelected(fresh.id);
  };

  return (
    <div className="flex h-full animate-fade">
      <aside className="flex w-80 shrink-0 flex-col border-r border-line">
        <header className="workspace-page-header flex h-13 shrink-0 items-center gap-3 border-b border-line px-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">Routines</h2>
            <p className="text-2xs text-ink-soft">{routines.filter((candidate) => candidate.on).length} on</p>
          </div>
          <Button size="xs" variant="outline" icon="plus" onClick={create}>
            New routine
          </Button>
        </header>
        <ul className="min-h-0 flex-1 overflow-y-auto p-2">
          {routines.map((candidate) => {
            const mate = mateById[candidate.mateId];
            return (
              <li key={candidate.id}>
                <div
                  role="button"
                  tabIndex={0}
                  aria-current={candidate.id === selected ? "true" : undefined}
                  onClick={() => setSelected(candidate.id)}
                  onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && (event.preventDefault(), setSelected(candidate.id))}
                  className="flex cursor-default items-center gap-3 rounded-xl px-2.5 py-2.5 outline-none transition-colors hover:bg-hover-fill focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand aria-[current=true]:bg-soft"
                >
                  {mate && <MateAvatar mate={{ ...mate, status: "idle" }} size={28} />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{candidate.name || "New routine"}</span>
                    <span className="block truncate text-xs text-ink-soft">{candidate.drafted && !candidate.on ? "Drafted for you" : scheduleText(candidate.days, candidate.time)}</span>
                  </span>
                  <span onClick={(event) => event.stopPropagation()}>
                    <Switch label={`${candidate.name} on`} on={candidate.on} onChange={(on) => update({ ...candidate, on, drafted: false })} />
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </aside>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        {routine ? (
          <RoutineDetail
            key={routine.id}
            routine={routine}
            mates={mates}
            now={now}
            onChange={update}
            onDelete={() => {
              setRoutines(routines.filter((candidate) => candidate.id !== routine.id));
              setSelected(routines.find((candidate) => candidate.id !== routine.id)?.id ?? null);
            }}
          />
        ) : (
          <p className="py-20 text-center text-sm text-ink-soft">No routines yet. Make one, or ask a mate in chat: "every morning, brief me on my day".</p>
        )}
      </div>
    </div>
  );
}
