import { Dialog } from "@base-ui/react/dialog";
import { useRef, useState, type ReactNode } from "react";
import { Icon } from "../components/ui/Icon.tsx";
import { Kbd } from "../components/ui/Kbd.tsx";
import { cn } from "../lib/utils.ts";
import { GROUP_ORDER, moveActive, rankCommands, type Command } from "./commandPalette.logic.ts";

export type PaletteItem = Command & { leading: ReactNode; run: () => void };

type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: PaletteItem[];
};

/**
 * Ctrl/⌘ K: jump to any mate, group or run, or do something, from the keyboard (T3 Code's
 * command palette). Base UI's dialog traps focus and closes on Escape or a click outside.
 */
export function CommandPalette({ open, onOpenChange, items }: CommandPaletteProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="motion-backdrop fixed inset-0 z-50 bg-black/20 dark:bg-black/50" />
        <Dialog.Popup className="motion-dialog fixed top-[14vh] left-1/2 z-50 flex max-h-[min(28rem,70vh)] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-line bg-raised text-ink shadow-2xl shadow-black/20 outline-none">
          <Dialog.Title className="sr-only">Search or jump to</Dialog.Title>
          <PaletteBody items={items} onDone={() => onOpenChange(false)} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PaletteBody({ items, onDone }: { items: PaletteItem[]; onDone: () => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const shown = rankCommands(items, query);
  const current = Math.min(active, Math.max(0, shown.length - 1));

  const choose = (item: PaletteItem | undefined) => {
    if (!item) return;
    onDone();
    item.run();
  };
  const move = (step: 1 | -1) => {
    const next = moveActive(current, shown.length, step);
    setActive(next);
    list.current?.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest" });
  };

  return (
    <>
      <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-line px-4">
        <Icon name="search" size={16} className="text-ink-soft" />
        <input
          autoFocus
          value={query}
          placeholder="Search mates, groups and runs, or type a command"
          aria-label="Search or jump to"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={shown[current] ? `palette-${shown[current].id}` : undefined}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-soft"
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              move(event.key === "ArrowDown" ? 1 : -1);
            } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              choose(shown[current]);
            }
          }}
        />
        <Kbd>Esc</Kbd>
      </div>
      <div ref={list} id="palette-list" role="listbox" className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {shown.length === 0 && <p className="px-3 py-6 text-center text-ink-soft">Nothing matches “{query.trim()}”.</p>}
        {GROUP_ORDER.map((group) => {
          const inGroup = shown.filter((item) => item.group === group);
          if (!inGroup.length) return null;
          return (
            <div key={group} role="group" aria-label={group} className="pb-1">
              <div className="px-2.5 pt-1.5 pb-1 text-2xs font-medium text-ink-soft">{group}</div>
              {inGroup.map((item) => {
                const index = shown.indexOf(item);
                return (
                  <div
                    key={item.id}
                    id={`palette-${item.id}`}
                    data-index={index}
                    role="option"
                    aria-selected={index === current}
                    onMouseMove={() => index !== current && setActive(index)}
                    onClick={() => choose(item)}
                    className={cn("flex h-9 cursor-default items-center gap-2.5 rounded-lg px-2.5 text-sm [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-soft", index === current && "bg-hover-fill")}
                  >
                    {item.leading}
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.hint && <span className="shrink-0 text-xs text-ink-soft">{item.hint}</span>}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
}
