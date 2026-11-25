import { ContextMenu } from "@base-ui/react/context-menu";
import type { ReactNode } from "react";
import { cn } from "../lib/utils.ts";

/** The pin, drawn here so the sidebar's glyph is its own. */
export function PinGlyph({ className, filled = false }: { className?: string; filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("size-3.5", className)} fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16.5V21M8.5 3.5h7l-1 5.5 3 3v2h-11v-2l3-3z" />
    </svg>
  );
}

/**
 * Right-click a chat in the sidebar for Pin or Unpin, as a desktop app would. A full shelf says so
 * instead of offering a pin it can't take.
 */
export function PinMenu({ children, pinned, full, onToggle }: { children: ReactNode; pinned: boolean; full: boolean; onToggle: () => void }) {
  const disabled = !pinned && full;
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger className="contents">{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner className="z-50 outline-none">
          <ContextMenu.Popup className="motion-popover min-w-44 origin-(--transform-origin) rounded-xl border border-line bg-raised p-1 text-sm text-ink shadow-lg shadow-black/10 outline-none dark:shadow-black/50">
            <ContextMenu.Item
              disabled={disabled}
              onClick={onToggle}
              className="flex h-8 cursor-default items-center gap-2 rounded-lg px-2 outline-none select-none data-disabled:opacity-50 data-highlighted:bg-hover-fill"
            >
              <PinGlyph className="text-ink-soft" filled={pinned} />
              {pinned ? "Unpin" : disabled ? "Pinned is full" : "Pin to the top"}
            </ContextMenu.Item>
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
