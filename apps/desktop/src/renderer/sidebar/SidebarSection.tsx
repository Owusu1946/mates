import { useState, type ReactNode } from "react";
import { cn } from "../lib/utils.ts";

/** A labelled group of rows that folds away when you click its label. */
export function SidebarSection({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="flex flex-col gap-px">
      <button
        type="button"
        aria-expanded={open}
        className="group flex h-7 items-center gap-1 rounded-control px-(--sidebar-row-inset) text-2xs font-medium text-ink-soft outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset"
        onClick={() => setOpen(!open)}
      >
        {label}
        <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("size-3 opacity-0 transition-[rotate,opacity] duration-150 group-hover:opacity-100", !open && "-rotate-90")} fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && children}
    </section>
  );
}
