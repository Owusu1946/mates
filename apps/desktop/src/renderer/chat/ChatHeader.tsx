import type { Chat, Mate } from "../data/sampleCrew.ts";
import { MateAvatar } from "./MateAvatar.tsx";

const STATUS_TEXT = { idle: null, listening: "Listening…", thinking: "Thinking…", working: "Working", waiting: "Waiting on you" } as const;

/** The chat's name and what its mate is up to. */
export function ChatHeader({ chat, lead, mates }: { chat: Chat; lead: Mate; mates: Mate[] }) {
  const status = STATUS_TEXT[lead.status] ?? lead.role;
  const subtitle = chat.kind === "group" ? mates.map((mate) => mate.name).join(", ") : chat.kind === "thread" ? `${lead.name} · ${status}` : status;
  return (
    <header className="flex h-13 shrink-0 items-center gap-2.5 border-b border-line px-6">
      {chat.kind !== "group" ? (
        <MateAvatar mate={lead} size={26} />
      ) : (
        <div className="flex -space-x-1.5">
          {mates.slice(0, 3).map((mate) => (
            <MateAvatar key={mate.id} mate={{ ...mate, status: "idle" }} size={20} />
          ))}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold">{chat.title}</h2>
        <p className="truncate text-2xs text-ink-soft">{subtitle}</p>
      </div>
    </header>
  );
}
