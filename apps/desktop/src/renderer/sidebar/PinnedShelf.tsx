import { useState, type ReactNode } from "react";
import { Icon } from "../components/ui/Icon.tsx";
import { Kbd, MOD } from "../components/ui/Kbd.tsx";
import { cn } from "../lib/utils.ts";
import { dropPlace, type PinPlace } from "./pins.logic.ts";
import { PinMenu } from "./PinMenu.tsx";
import { movePin, togglePinned } from "./pins.ts";

export type ShelfItem = {
  id: string;
  title: string;
  face: ReactNode;
  unread: boolean;
  /** A mate waiting on you shows it on the shelf too. */
  needsYou: boolean;
  selected: boolean;
  jump: number | null;
};

/**
 * The mates you keep at hand, standing together at the top of the sidebar: their faces show what
 * they're doing, a dot says when something's new or someone needs you. Drag one to move it; hover
 * for the small unpin. The one just pinned hops up onto the shelf.
 */
export function PinnedShelf({ items, hopped, onSelect }: { items: ShelfItem[]; hopped: string | null; onSelect: (id: string) => void }) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; place: PinPlace } | null>(null);

  return (
    <div role="list" aria-label="Pinned" className="grid grid-cols-4 gap-1 px-0.5">
      {items.map((item) => (
        <PinMenu key={item.id} pinned full={false} onToggle={() => togglePinned(item.id)}>
        <div
          role="listitem"
          draggable
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", item.id);
            setDragging(item.id);
          }}
          onDragOver={(event) => {
            if (!dragging || dragging === item.id) return;
            event.preventDefault();
            const box = event.currentTarget.getBoundingClientRect();
            setDrop({ id: item.id, place: dropPlace(event.clientX, box.left, box.width) });
          }}
          onDragLeave={() => setDrop((current) => (current?.id === item.id ? null : current))}
          onDrop={(event) => {
            event.preventDefault();
            if (dragging && drop) movePin(dragging, drop.id, drop.place);
            setDrop(null);
          }}
          onDragEnd={() => {
            setDragging(null);
            setDrop(null);
          }}
          className={cn("group/pin relative", item.id === hopped && "pin-hop", dragging === item.id && "opacity-40")}
        >
          {drop?.id === item.id && <span aria-hidden="true" className={cn("absolute top-2 bottom-5 z-10 w-0.5 rounded-full bg-brand", drop.place === "before" ? "-left-0.5" : "-right-0.5")} />}
          <button
            type="button"
            aria-current={item.selected ? "page" : undefined}
            aria-label={`${item.title}${item.needsYou ? ", needs you" : item.unread ? ", unread" : ""}`}
            onClick={() => onSelect(item.id)}
            className="flex w-full flex-col items-center gap-1 rounded-xl px-0.5 pt-2 pb-1.5 outline-none transition-colors duration-150 hover:bg-rail-hover focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset aria-[current=page]:bg-rail-selected"
          >
            <span className="relative flex size-10 items-center justify-center">
              {item.face}
              {(item.needsYou || item.unread) && (
                <span className={cn("absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-rail", item.needsYou ? "bg-caution" : "bg-brand")} aria-hidden="true" />
              )}
              {item.jump !== null && (
                <span className="absolute -bottom-1 animate-fade">
                  <Kbd>
                    {MOD}
                    {item.jump}
                  </Kbd>
                </span>
              )}
            </span>
            <span className={cn("w-full truncate text-center text-[11px] leading-4", item.unread || item.selected ? "text-ink" : "text-ink-soft")}>{item.title}</span>
          </button>
          <button
            type="button"
            aria-label={`Unpin ${item.title}`}
            title="Unpin"
            onClick={() => togglePinned(item.id)}
            className="absolute top-0.5 right-0.5 flex size-4.5 items-center justify-center rounded-full border border-line bg-raised text-ink-soft opacity-0 shadow-xs transition-opacity duration-150 group-hover/pin:opacity-100 hover:text-ink focus-visible:opacity-100"
          >
            <Icon name="x" size={10} />
          </button>
        </div>
        </PinMenu>
      ))}
    </div>
  );
}
