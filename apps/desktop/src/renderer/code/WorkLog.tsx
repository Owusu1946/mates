import { createContext, use, useId, useLayoutEffect, useRef, type ComponentProps, type ReactNode } from "react";
import { cn } from "../lib/utils.ts";

/**
 * The work log's slots, ported from T3 Code (components/chat/WorkLog.tsx). Every row of a
 * mate's work is built from these and none restyle them: a 24px icon column, a label in
 * secondary text that truncates, and an optional trailing part.
 */

const GroupedRows = createContext(false);

export function WorkLogList({ children }: { children: ReactNode }) {
  return (
    <GroupedRows value>
      <div className="flex min-w-0 flex-col">{children}</div>
    </GroupedRows>
  );
}

type RowContent = { icon?: ReactNode; label: ReactNode; trailing?: ReactNode; wrapLabel?: boolean };

const focusRing = "rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/70";

type LineProps = Omit<ComponentProps<"div">, "className" | "style" | "children">;

function WorkLogLine({ icon, label, trailing, wrapLabel, ...lineProps }: RowContent & LineProps) {
  return (
    <div {...lineProps} className={cn("flex min-h-6 min-w-0 gap-1.5 text-sm leading-relaxed select-none", wrapLabel ? "items-start" : "items-center", lineProps.role === "button" && focusRing)}>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {icon && <span className="flex size-6 shrink-0 items-center justify-center">{icon}</span>}
        <div className={cn("min-w-0 flex-1 text-ink-soft", !wrapLabel && "truncate [&_*]:whitespace-nowrap")}>{label}</div>
      </div>
      {trailing}
    </div>
  );
}

function useRowClassName(interactive: boolean, focusable = interactive) {
  const grouped = use(GroupedRows);
  return cn("group/row relative w-full min-w-0 rounded-md px-0.5 text-left transition-colors", grouped ? "py-0" : "py-0.5", interactive && "cursor-pointer hover:bg-hover-fill", focusable && focusRing);
}

export function WorkLogButton({ icon, label, trailing, wrapLabel = false, ...buttonProps }: RowContent & Omit<ComponentProps<"button">, "className" | "style" | "children">) {
  const className = useRowClassName(true);
  return (
    <button {...buttonProps} type="button" className={className}>
      <WorkLogLine icon={icon} label={label} trailing={trailing} wrapLabel={wrapLabel} />
    </button>
  );
}

type RowProps = Omit<ComponentProps<"div">, "className" | "style"> & { toggle?: LineProps };

/** A div disclosure, so the detail stays selectable. `toggle` goes on the header line only. */
export function WorkLogRow({ icon, label, trailing, wrapLabel = false, toggle, children, ...rowProps }: RowContent & RowProps) {
  const className = useRowClassName(rowProps.onClick !== undefined, false);
  const detailsId = useId();
  return (
    <div {...rowProps} className={className}>
      <WorkLogLine aria-controls={toggle ? detailsId : undefined} {...toggle} icon={icon} label={label} trailing={trailing} wrapLabel={wrapLabel} />
      {toggle ? <div id={detailsId}>{children}</div> : children}
    </div>
  );
}

const LIVE_EDGE_PX = 4;

/** A row's expanded detail. With `followLive` it stays at the bottom while you're there. */
export function WorkLogDetails({ children, kind = "text", followLive = false }: { children: ReactNode; kind?: "text" | "panel"; followLive?: boolean }) {
  const scroller = useRef<HTMLDivElement>(null);
  const atLiveEdge = useRef(true);
  useLayoutEffect(() => {
    if (followLive && atLiveEdge.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  });
  return (
    <div
      ref={scroller}
      onScroll={(event) => {
        const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
        atLiveEdge.current = scrollHeight - scrollTop - clientHeight <= LIVE_EDGE_PX;
      }}
      className={cn("cursor-auto", kind === "text" ? "ms-7 flex max-h-96 flex-col gap-3 overflow-auto px-0.5 py-1 select-text" : "ms-7 mt-0.5 mb-1.5")}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
}
