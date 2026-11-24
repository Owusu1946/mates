import { MateAvatar } from "../chat/MateAvatar.tsx";
import { Button } from "../components/ui/Button.tsx";
import { Icon } from "../components/ui/Icon.tsx";
import { Menu, MenuItem } from "../components/ui/Menu.tsx";
import type { Mate } from "../data/sampleCrew.ts";
import { tickTextContent } from "../lib/tickTextContent.ts";
import { cn } from "../lib/utils.ts";
import { formatCallTime, type CallAction, type CallState } from "./call.logic.ts";

type CallPanelProps = {
  call: CallState;
  mates: Record<string, Mate>;
  you: string;
  dispatch: (action: CallAction) => void;
  onEnd: () => void;
  onClose: () => void;
};

const roundButton = "flex size-11 items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand [&_svg]:size-5";

/** One person on the call: a ring and a talking face while they speak; the others listen. */
function Member({ call, mate, size }: { call: CallState; mate: Mate; size: number }) {
  const speaking = call.speaker === mate.id;
  const live = call.phase === "live";
  return (
    <div className="flex flex-col items-center gap-2">
      <span className={cn("rounded-full p-1.5 ring-2 transition-[box-shadow,--tw-ring-color] duration-300", speaking ? "ring-ok/70" : call.phase === "connecting" ? "status-pulse ring-brand/40" : "ring-transparent")}>
        <MateAvatar mate={{ ...mate, status: call.phase === "connecting" ? "thinking" : speaking ? "working" : live ? "listening" : "idle" }} size={size} />
      </span>
      <span className="text-center">
        <span className="block text-sm font-medium">{mate.name}</span>
        <span className="block text-2xs text-ink-soft">{call.phase === "connecting" ? "Ringing…" : speaking ? "Talking" : live ? "Listening" : mate.role}</span>
      </span>
    </div>
  );
}

/**
 * A call with your mates beside the chat, as on the phone: whoever's talking shows it on their
 * face, the others listen, captions follow along, and the summary lands in the chat when it ends.
 * The timer writes its own text every second, so nothing re-renders for it.
 */
export function CallPanel({ call, mates, you, dispatch, onEnd, onClose }: CallPanelProps) {
  const members = call.memberIds.flatMap((id) => (mates[id] ? [mates[id]] : []));
  const [lead, ...others] = members;
  const invitable = Object.values(mates).filter((mate) => !call.memberIds.includes(mate.id));
  const live = call.phase === "live";

  if (call.phase === "ended") {
    const duration = (call.endedAt ?? call.startedAt) - call.startedAt;
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="flex -space-x-2">
          {members.slice(0, 4).map((mate) => (
            <MateAvatar key={mate.id} mate={{ ...mate, status: "happy" }} size={40} />
          ))}
        </div>
        <div>
          <p className="font-semibold">Call ended · {formatCallTime(duration)}</p>
          <p className="mt-1 text-sm text-ink-soft">The summary is in the chat.</p>
        </div>
        <Button variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center justify-center gap-2 text-xs text-ink-soft">
        <span className={cn("size-1.5 rounded-full", live ? "bg-ok" : "status-pulse bg-brand")} />
        {live ? (
          <span>
            On call · <span ref={tickTextContent((now) => formatCallTime(now - call.startedAt), true)} className="tabular-nums" />
          </span>
        ) : (
          `Calling ${lead?.name ?? "your mate"}…`
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-4">
        {lead && <Member call={call} mate={lead} size={96} />}
        {others.length > 0 && (
          <div className="flex flex-wrap justify-center gap-5">
            {others.map((mate) => (
              <Member key={mate.id} call={call} mate={mate} size={52} />
            ))}
          </div>
        )}
      </div>

      {live && call.captionsOn && call.captions.length > 0 && (
        <div className="mx-4 mb-3 flex flex-col gap-1.5 rounded-xl bg-soft p-3" aria-live="polite">
          {call.captions.map((caption, index) => (
            <p key={caption.id} className={cn("animate-fade text-sm leading-snug transition-opacity", index < call.captions.length - 2 && "opacity-50")}>
              <span className="font-medium">{caption.speaker === "me" ? you : (mates[caption.speaker]?.name ?? "")}</span>
              <span className="text-ink-soft"> · </span>
              {caption.text}
            </p>
          ))}
        </div>
      )}

      <div className="flex shrink-0 items-center justify-center gap-3 border-t border-line px-4 py-3">
        <button type="button" aria-pressed={call.muted} aria-label={call.muted ? "Unmute" : "Mute"} onClick={() => dispatch({ type: "mute" })} className={cn(roundButton, call.muted ? "bg-ink text-canvas" : call.speaker === "me" ? "bg-ok/15 text-ok-ink" : "bg-soft text-ink hover:bg-hover-fill")}>
          <Icon name={call.muted ? "micOff" : "mic"} />
        </button>
        <button type="button" aria-pressed={call.captionsOn} aria-label="Captions" onClick={() => dispatch({ type: "captions" })} className={cn(roundButton, call.captionsOn ? "bg-hover-fill text-ink" : "bg-soft text-ink-soft hover:bg-hover-fill")}>
          <Icon name="captions" />
        </button>
        <Menu
          side="top"
          align="end"
          trigger={
            <button type="button" aria-label="Add a mate" disabled={!invitable.length} className={cn(roundButton, "bg-soft text-ink hover:bg-hover-fill disabled:opacity-40")}>
              <Icon name="plus" />
            </button>
          }
        >
          {invitable.map((mate) => (
            <MenuItem key={mate.id} onClick={() => dispatch({ type: "invite", mateId: mate.id })}>
              <MateAvatar mate={{ ...mate, status: "idle" }} size={18} still />
              {mate.name}
            </MenuItem>
          ))}
        </Menu>
        <button type="button" aria-label="End call" onClick={onEnd} className={cn(roundButton, "w-16 bg-danger text-white hover:bg-danger/90")}>
          <Icon name="phone" className="rotate-[135deg]" />
        </button>
      </div>
    </div>
  );
}
