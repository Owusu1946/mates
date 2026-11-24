import { useState } from "react";
import { Button } from "../components/ui/Button.tsx";
import { Icon } from "../components/ui/Icon.tsx";
import type { Terminal } from "../data/sampleRuns.ts";
import { useResizable } from "../hooks/useResizable.ts";
import { DRAWER, drawerMaxHeight } from "./panelSize.logic.ts";
import { TerminalView } from "./TerminalView.tsx";

type TerminalDrawerProps = {
  terminals: Terminal[];
  output: Record<string, string[]>;
  onClose: () => void;
};

/**
 * The run's terminals in a drawer under the timeline (T3 Code's ThreadTerminalDrawer): a tab
 * each, its top edge drags, at least 180px and at most three quarters of the column. Every
 * terminal stays mounted so switching tabs keeps its scrollback.
 */
export function TerminalDrawer({ terminals, output, onClose }: TerminalDrawerProps) {
  const [active, setActive] = useState(terminals[0]?.id ?? "");
  const { hostStyle, handleProps } = useResizable({
    storageKey: "mates.drawer-height",
    property: "--drawer-height",
    axis: "y",
    edge: "start",
    defaultSize: DRAWER.defaultHeight,
    min: DRAWER.minHeight,
    max: () => drawerMaxHeight(document.querySelector("[data-run-column]")?.clientHeight ?? window.innerHeight),
  });
  return (
    <section data-focus-area="terminal" tabIndex={-1} style={hostStyle} aria-label="Terminal" className="relative flex h-(--drawer-height) max-h-[75%] min-h-45 shrink-0 flex-col border-t border-line bg-canvas outline-none">
      <div {...handleProps} aria-label="Resize the terminal" className="absolute inset-x-0 -top-1 z-10 h-2 cursor-row-resize" />
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
    </section>
  );
}
