import type { Card } from "../../data/sampleCrew.ts";
import { useMemoryUndo, useRoutine, useWatch } from "../../remote/cardControls.ts";
import { MemoryLine } from "./QuietCards.tsx";
import { ScheduleCard, WatchCard } from "./StandingCards.tsx";

/**
 * The standing cards (a routine, a watch, a saved memory) for real: each shows how it stands now
 * and changes through the API (cardControls.ts), not just on this screen. They draw the same cards
 * as the sample; what changes is where a change goes.
 */

const Problem = ({ text }: { text: string | null }) => (text ? <p role="alert" className="text-xs text-danger-ink">{text}</p> : null);

/** Pause, resume or cancel: the card's new status, as the API's action. */
const actionFor = (status: string) => (status === "paused" ? "pause" : status === "cancelled" ? "cancel" : "resume");

export function LiveScheduleCard({ card }: { card: Extract<Card, { type: "schedule" }> }) {
  const { routine, error, control } = useRoutine(card.routineId);
  const status = routine?.status === "paused" ? "paused" : routine?.status === "cancelled" ? "cancelled" : card.status;
  const next = routine?.nextRunAt ? new Date(routine.nextRunAt).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }) : card.next;
  return (
    <div className="flex flex-col gap-1">
      <ScheduleCard card={{ ...card, status, next }} onChange={(changed) => changed.type === "schedule" && void control(actionFor(changed.status), card.version)} />
      <Problem text={error} />
    </div>
  );
}

export function LiveWatchCard({ card }: { card: Extract<Card, { type: "watch" }> }) {
  const { watch, error, control } = useWatch(card.watchId);
  const status = (watch?.status as typeof card.status | undefined) ?? card.status;
  const lastChecked = watch?.lastCheckedAt ? new Date(watch.lastCheckedAt).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }) : card.lastChecked;
  return (
    <div className="flex flex-col gap-1">
      <WatchCard card={{ ...card, status, lastNote: watch?.lastNote ?? card.lastNote, lastChecked }} onChange={(changed) => changed.type === "watch" && void control(actionFor(changed.status), card.version)} />
      <Problem text={error} />
    </div>
  );
}

export function LiveMemoryLine({ card }: { card: Extract<Card, { type: "memory" }> }) {
  const { undone, error, undo } = useMemoryUndo();
  return (
    <div className="flex flex-col gap-1">
      <MemoryLine card={{ ...card, undone: undone || card.undone }} onChange={() => card.id && void undo(card.id)} canUndo={card.action === "saved"} />
      <Problem text={error} />
    </div>
  );
}
