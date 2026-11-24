import type { ReactNode } from "react";

/** A keyboard shortcut hint, T3 Code's keycap (components/ui/kbd.tsx). */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="pointer-events-none inline-flex h-5 min-w-5 select-none items-center justify-center gap-1 rounded border border-b-2 border-ink/15 px-1.5 font-sans text-2xs font-medium text-ink-soft">
      {children}
    </kbd>
  );
}

/** "Ctrl" or "⌘", for shortcut labels. */
export const MOD = window.mates.platform === "darwin" ? "⌘" : "Ctrl";
