import { Popover } from "@base-ui/react/popover";
import { createContext, type ReactElement, type ReactNode } from "react";
import { Icon } from "../../components/ui/Icon.tsx";
import type { CardStatus, Mate } from "../../data/sampleCrew.ts";
import { cn } from "../../lib/utils.ts";

/**
 * What every chat card is made of, so they read as one family: a hairline surface, a quiet
 * header, plain rows, and small text actions. Cards only box what you can act on; everything
 * else sits in the chat like words.
 */

/** The chat's mates, for cards that show who said what. */
export const CardMatesContext = createContext<Record<string, Mate>>({});

export function CardSurface({ children, className, tone }: { children: ReactNode; className?: string; tone?: "caution" }) {
  return <section className={cn("overflow-hidden rounded-xl border bg-raised transition-colors duration-200", tone === "caution" ? "border-caution/40" : "border-line", className)}>{children}</section>;
}

/** A square for an icon at the start of a header, in the same grey as the rest of the app. */
export function CardGlyph({ children }: { children: ReactNode }) {
  return <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-soft text-ink-soft [&_svg]:size-4">{children}</span>;
}

/** A text action: Pause, Undo, Open. Quieter than a button, and still a real button. */
export function QuietAction({ children, onClick, tone }: { children: ReactNode; onClick: () => void; tone?: "danger" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-1.5 py-0.5 text-xs font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand",
        tone === "danger" ? "text-ink-soft hover:bg-hover-fill hover:text-danger-ink" : "text-ink-soft hover:bg-hover-fill hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

/** A small popover from a quiet trigger, for the details behind a line (sources, a memory). */
export function CardPopover({ trigger, children, label }: { trigger: ReactElement; children: ReactNode; label: string }) {
  return (
    <Popover.Root>
      <Popover.Trigger render={trigger} />
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6} className="z-50 outline-none">
          <Popover.Popup aria-label={label} className="motion-popover w-80 origin-(--transform-origin) rounded-xl border border-line bg-raised p-1 text-sm text-ink shadow-lg shadow-black/10 outline-none dark:shadow-black/50">
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** The four-pointed sparkle that marks what a mate remembers. */
export function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("size-3.5", className)} fill="currentColor">
      <path d="M12 2.5c.5 4.6 2.4 6.9 7 9.5-4.6 2.6-6.5 4.9-7 9.5-.5-4.6-2.4-6.9-7-9.5 4.6-2.6 6.5-4.9 7-9.5z" />
    </svg>
  );
}

/** How a card's answer stands: "Doing it now…" with a spinner while it goes, or why it couldn't. */
export function CardAnswerLine({ status }: { status: CardStatus | undefined }) {
  if (!status) return null;
  if ("pending" in status)
    return (
      <p role="status" className="flex animate-fade items-center gap-2 text-sm text-ink-soft">
        <span className="size-3 shrink-0 animate-spin rounded-full border-[1.5px] border-current border-r-transparent" aria-hidden="true" />
        {status.pending}
      </p>
    );
  return (
    <p role="alert" className="flex items-center gap-1.5 text-sm text-danger-ink">
      <Icon name="alert" size={14} />
      {status.error}
    </p>
  );
}
