import type { ReactNode } from "react";
import { Kbd, MOD } from "../components/ui/Kbd.tsx";
import { cn } from "../lib/utils.ts";
import { PinGlyph, PinMenu } from "./PinMenu.tsx";

type ChatRowProps = {
  face: ReactNode;
  title: string;
  /** The last message, or what the mate is doing now. */
  subtitle: ReactNode;
  time?: string;
  unread?: boolean;
  selected: boolean;
  /** The Ctrl/⌘ number, shown while the key is held. */
  jump: number | null;
  onSelect: () => void;
  /** Pinning: a pin on hover where the time was, and Pin in the right-click menu. */
  pin?: { full: boolean; onToggle: () => void };
};

/**
 * A chat in the sidebar, two lines like a messaging app (and OpenMausBot): the mate's face big
 * enough to read its mood, the name and time, then the last message or what it's doing. Hover
 * and the time steps aside for a pin.
 */
export function ChatRow({ face, title, subtitle, time, unread = false, selected, jump, onSelect, pin }: ChatRowProps) {
  const row = (
    <button
      type="button"
      aria-current={selected ? "page" : undefined}
      onClick={onSelect}
      className="flex h-14 w-full shrink-0 items-center gap-3 rounded-xl px-2 text-left outline-none transition-colors duration-150 hover:bg-rail-hover focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset aria-[current=page]:bg-rail-selected"
    >
      <span className="flex size-9 shrink-0 items-center justify-center">{face}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={cn("min-w-0 flex-1 truncate text-sm font-medium", unread ? "text-ink" : "text-ink/90")}>{title}</span>
          {jump !== null ? (
            <span className="animate-fade">
              <Kbd>
                {MOD}
                {jump}
              </Kbd>
            </span>
          ) : (
            time && <span className={cn("shrink-0 text-2xs text-ink-soft tabular-nums transition-opacity duration-150", pin && "group-hover/row:opacity-0 group-focus-within/row:opacity-0")}>{time}</span>
          )}
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-xs text-ink-soft">{subtitle}</span>
          {unread && <span className="size-2 shrink-0 rounded-full bg-brand" aria-label="Unread" />}
        </span>
      </span>
    </button>
  );
  if (!pin) return row;
  return (
    <PinMenu pinned={false} full={pin.full} onToggle={pin.onToggle}>
      <div className="group/row relative">
        {row}
        {jump === null && (
          <button
            type="button"
            aria-label={pin.full ? "Pinned is full" : `Pin ${title}`}
            title={pin.full ? "Pinned is full" : "Pin to the top"}
            disabled={pin.full}
            onClick={pin.onToggle}
            className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-md text-ink-soft opacity-0 transition-[opacity,color,background-color] duration-150 group-hover/row:opacity-100 hover:bg-hover-fill hover:text-ink focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-ink-soft"
          >
            <PinGlyph />
          </button>
        )}
      </div>
    </PinMenu>
  );
}
