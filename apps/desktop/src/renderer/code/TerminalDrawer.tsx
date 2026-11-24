import { Collapsible } from "@base-ui/react/collapsible";
import { useState } from "react";
import { Button } from "../components/ui/Button.tsx";
import { Icon } from "../components/ui/Icon.tsx";
import type { Terminal } from "../data/sampleRuns.ts";
import { useResizable } from "../hooks/useResizable.ts";
import { DRAWER, drawerMaxHeight } from "./panelSize.logic.ts";
import { TerminalView } from "./TerminalView.tsx";

type TerminalDrawerProps = {
  open: boolean;
  terminals: Terminal[];
  output: Record<string, string[]>;
  onClose: () => void;
};

/**
 * The run's terminals in a drawer under the timeline (T3 Code's ThreadTerminalDrawer): a tab
 * each, its top edge drags, and its height leaves room for the thread header and composer. Every
 * terminal stays mounted so switching tabs keeps its scrollback.
 */
export function TerminalDrawer({ open, terminals, output, onClose }: TerminalDrawerProps) {
  const [active, setActive] = useState(terminals[0]?.id ?? "");
  const { hostStyle, handleProps, dragging } = useResizable({
    storageKey: "mates.drawer-height",
    property: "--drawer-height",
    axis: "y",
    edge: "start",
    defaultSize: DRAWER.defaultHeight,
    min: DRAWER.minHeight,
    max: () => drawerMaxHeight(document.querySelector("[data-run-column]")?.clientHeight ?? window.innerHeight),
  });
  const drawerStyle = { ...hostStyle, "--drawer-thread-min-height": `${DRAWER.threadMinHeight}px` };
  return (
    <Collapsible.Root open={open} className="contents">
      <Collapsible.Panel render={<section />} data-focus-area={open ? "terminal" : undefined} data-dragging={dragging || undefined} inert={!open} tabIndex={-1} style={drawerStyle} aria-label="Terminal" className="motion-drawer relative flex shrink-0 flex-col border-t border-line bg-canvas outline-none">
        <div {...handleProps} aria-label="Resize the terminal" className="absolute inset-x-0 top-0 z-10 h-2 cursor-row-resize" />
        <div className="flex h-8 shrink-0 items-center gap-1 px-2" role="tablist">
          {terminals.map((terminal) => (
            <button
              key={terminal.id}
              type="button"
              role="tab"
              aria-selected={terminal.id === active}
              onClick={() => setActive(terminal.id)}
              className="flex h-6 items-center gap-1 rounded-md ps-1.5 pe-2 text-xs text-ink-soft outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand aria-selected:bg-hover-fill aria-selected:text-ink"
            >
              <Icon name="terminal" size={14} />
              {terminal.label}
            </button>
          ))}
          <div className="flex-1" />
          <Button variant="ghost-muted" size="icon-xs" icon="x" aria-label="Close the terminal" onClick={onClose} />
        </div>
        <div className="relative min-h-0 flex-1">
          {terminals.map((terminal) => (
            <div key={terminal.id} className="absolute inset-0" hidden={terminal.id !== active}>
              <TerminalView outputIds={output[terminal.id] ?? []} visible={terminal.id === active} />
            </div>
          ))}
        </div>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
