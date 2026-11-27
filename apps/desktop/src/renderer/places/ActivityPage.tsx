import { useState } from "react";
import { MateAvatar } from "../chat/MateAvatar.tsx";
import { Button } from "../components/ui/Button.tsx";
import { Icon } from "../components/ui/Icon.tsx";
import type { Mate } from "../data/sampleCrew.ts";
import { ACTIVITY, type ActivityItem } from "../data/samplePlaces.ts";
import { cn } from "../lib/utils.ts";
import { groupActivity, timeAgo, type ActivityFilter, type ActivityStatus } from "./places.logic.ts";

const STATUS: Record<ActivityStatus, { label: string; tone: string }> = {
  working: { label: "Working", tone: "text-brand" },
  needsYou: { label: "Needs your input", tone: "text-caution-ink" },
  done: { label: "Done", tone: "text-ok-ink" },
  failed: { label: "Didn't finish", tone: "text-danger-ink" },
};

const FILTERS: { value: ActivityFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "needsYou", label: "Needs you" },
  { value: "done", label: "Done" },
];

function Row({ item, mate, now, onOpen }: { item: ActivityItem; mate: Mate | undefined; now: number; onOpen: () => void }) {
  const [open, setOpen] = useState(false);
  const status = STATUS[item.status];
  return (
    <li className="rounded-xl transition-colors hover:bg-hover-fill">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand">
        {mate && <MateAvatar mate={{ ...mate, status: item.status === "working" ? "working" : "idle" }} size={30} />}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{item.title}</span>
          <span className="block truncate text-xs text-ink-soft">
            {mate?.name} · <span className={cn(status.tone, item.status === "working" && "shimmer")}>{status.label}</span>
          </span>
        </span>
        <span className="shrink-0 text-2xs text-ink-soft">{timeAgo(item.at, now)}</span>
      </button>
      {open && (
        <div className="animate-fade px-3 pb-3 ps-[3.375rem]">
          <p className="text-sm text-ink-soft select-text">{item.result ?? (item.status === "working" ? "Working on it. The result is saved here when it's done." : "No written result for this one.")}</p>
          <Button variant="outline" size="xs" className="mt-2.5" onClick={onOpen}>
            {item.status === "needsYou" ? "Answer in chat" : "Open in chat"}
            <Icon name="external" />
          </Button>
        </div>
      )}
    </li>
  );
}

/**
 * Everything your mates did for you, newest first, as on the phone (apps/mobile/app/(app)/feed.tsx):
 * what's running, what needs you, what's done and what didn't finish, each with its result and the
 * chat it came from.
 */
export function ActivityPage({ mates, onOpenChat }: { mates: Record<string, Mate>; onOpenChat: (chatId: string) => void }) {
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [notify, setNotify] = useState(true);
  const [now] = useState(() => Date.now());
  const groups = groupActivity(ACTIVITY, filter, now);
  const needsYou = ACTIVITY.filter((item) => item.status === "needsYou").length;

  return (
    <div className="flex h-full animate-fade flex-col">
      <header className="workspace-page-header flex h-13 shrink-0 items-center gap-3 border-b border-line px-6">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">What mates did</h2>
          <p className="text-2xs text-ink-soft">{needsYou ? `${needsYou} need${needsYou === 1 ? "s" : ""} your input` : "All caught up"}</p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-soft">
          <input type="checkbox" checked={notify} onChange={(event) => setNotify(event.target.checked)} className="size-3.5 accent-(--brand)" />
          Notify me when a mate is done
        </label>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-(--chat-max-width) flex-col gap-5 px-6 py-5">
          <div role="radiogroup" aria-label="Show" className="flex w-fit gap-0.5 rounded-lg bg-soft p-0.5">
            {FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={filter === option.value}
                onClick={() => setFilter(option.value)}
                className="h-7 rounded-md px-3 text-xs text-ink-soft transition-colors aria-checked:bg-raised aria-checked:text-ink aria-checked:shadow-xs"
              >
                {option.label}
              </button>
            ))}
          </div>
          {groups.length === 0 && <p className="py-10 text-center text-sm text-ink-soft">Nothing here yet.</p>}
          {groups.map((group) => (
            <section key={group.day} className="flex flex-col gap-1">
              <h3 className="px-3 text-2xs font-medium text-ink-soft">{group.day}</h3>
              <ul className="flex flex-col">
                {group.items.map((item) => (
                  <Row key={item.id} item={item} mate={mates[item.mateId]} now={now} onOpen={() => onOpenChat(item.chatId)} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
