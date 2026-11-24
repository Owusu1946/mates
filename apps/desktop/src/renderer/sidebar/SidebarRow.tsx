import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { Kbd, MOD } from "../components/ui/Kbd.tsx";
import { cn } from "../lib/utils.ts";

type SidebarRowProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  ref?: Ref<HTMLButtonElement>;
  leading: ReactNode;
  label: string;
  selected?: boolean;
  /** Quiet text on the right: a time, a count, where a repo lives. */
  meta?: ReactNode;
  unread?: boolean;
  /** The Ctrl/⌘ number, shown while the key is held. */
  jump?: number | null;
  /** A row under another, like a run under its repo: indented past the parent's icon. */
  nested?: boolean;
};

/**
 * One sidebar row, T3 Code's SidebarThreadRow: h-8, text-sm, a soft fill on hover and when
 * selected. While Ctrl/⌘ is held the right side swaps to the row's jump number.
 */
export function SidebarRow({ ref, leading, label, selected = false, meta, unread = false, jump = null, nested = false, className: _className, ...rest }: SidebarRowProps) {
  return (
    <button
      ref={ref}
      type="button"
      aria-current={selected ? "page" : undefined}
      className={cn(
        "flex h-8 w-full shrink-0 items-center gap-2 rounded-control px-(--sidebar-row-inset) text-left text-sm font-medium text-ink/80 outline-none transition-colors duration-150 hover:bg-rail-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset aria-[current=page]:bg-rail-selected aria-[current=page]:text-ink [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-soft",
        nested && "ps-8 font-normal",
      )}
      {...rest}
    >
      <span className="flex size-5 shrink-0 items-center justify-center">{leading}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {jump !== null ? (
        <span className="animate-fade">
          <Kbd>
            {MOD}
            {jump}
          </Kbd>
        </span>
      ) : unread ? (
        <span className="size-2 rounded-full bg-brand" aria-label="Unread" />
      ) : (
        meta && <span className="text-2xs font-normal text-ink-soft tabular-nums">{meta}</span>
      )}
    </button>
  );
}
