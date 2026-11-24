import { Button } from "../components/ui/Button.tsx";
import { Tooltip } from "../components/ui/Tooltip.tsx";
import type { Chat, Mate } from "../data/sampleCrew.ts";
import { cn } from "../lib/utils.ts";
import { MateAvatar } from "./MateAvatar.tsx";

const STATUS_TEXT = { idle: null, listening: "Listening…", thinking: "Thinking…", working: "Working", happy: null, waiting: "Waiting on you" } as const;

export type SidePanel = "call" | "computer" | null;

type ChatHeaderProps = {
  chat: Chat;
  lead: Mate;
  mates: Mate[];
  side: SidePanel;
  /** A call is live (here or in another chat). */
  inCall: boolean;
  /** The mate's computer is doing something. */
  computerBusy: boolean;
  onCall: () => void;
  onComputer: () => void;
  /** Edit the mate, or the group. */
  onEdit: () => void;
};

/** The chat's name and what its mate is up to, with Call and Computer on the right. */
export function ChatHeader({ chat, lead, mates, side, inCall, computerBusy, onCall, onComputer, onEdit }: ChatHeaderProps) {
  const status = STATUS_TEXT[lead.status] ?? lead.role;
  const subtitle = chat.kind === "group" ? mates.map((mate) => mate.name).join(", ") : chat.kind === "thread" ? `${lead.name} · ${status}` : status;
  return (
    <header className="flex h-13 shrink-0 items-center gap-2.5 border-b border-line px-6">
      {chat.kind !== "group" ? (
        <MateAvatar mate={lead} size={32} />
      ) : (
        <div className="flex -space-x-1.5">
          {mates.slice(0, 3).map((mate) => (
            <MateAvatar key={mate.id} mate={{ ...mate, status: "idle" }} size={20} />
          ))}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1">
          <h2 className="truncate text-sm font-semibold">{chat.title}</h2>
          <Tooltip side="bottom" content={chat.kind === "group" ? "Edit group" : `Edit ${lead.name}`}>
            <Button variant="ghost-muted" size="icon-xs" icon="edit" aria-label={chat.kind === "group" ? "Edit group" : `Edit ${lead.name}`} onClick={onEdit} />
          </Tooltip>
        </div>
        <p className="truncate text-2xs text-ink-soft">{subtitle}</p>
      </div>
      <Tooltip side="bottom" content={inCall ? "Back to the call" : chat.kind === "group" ? `Call ${chat.title}` : `Call ${lead.name}`}>
        <Button variant={side === "call" ? "secondary" : "ghost-muted"} size="icon-sm" icon="phone" aria-label="Call" aria-pressed={side === "call"} onClick={onCall} className={cn(inCall && "text-ok-ink")} />
      </Tooltip>
      <Tooltip side="bottom" content="Your computer">
        <span className="relative">
          <Button variant={side === "computer" ? "secondary" : "ghost-muted"} size="icon-sm" icon="monitor" aria-label="Computer" aria-pressed={side === "computer"} onClick={onComputer} />
          {computerBusy && <span className="status-pulse pointer-events-none absolute top-1 right-1 size-1.5 rounded-full bg-ok" />}
        </span>
      </Tooltip>
    </header>
  );
}
