import type { ReactNode } from "react";
import { Button } from "../components/ui/Button.tsx";
import { Icon, type IconName } from "../components/ui/Icon.tsx";
import { useResizable } from "../hooks/useResizable.ts";
import { PANEL, panelMaxWidth } from "./panelSize.logic.ts";

type RightPanelProps = {
  tabs: { id: string; label: string; icon: IconName }[];
  active: string;
  onClose: () => void;
  children: ReactNode;
};

/**
 * The panel beside a run (T3 Code's ChatRightPanel and RightPanelTabs): tabs on top, its left
 * edge drags to resize. CSS caps it at 70% of the window and always leaves the chat 360px; the
 * same caps clamp a drag.
 */
export function RightPanel({ tabs, active, onClose, children }: RightPanelProps) {
  const { hostStyle, handleProps } = useResizable({
    storageKey: "mates.panel-width",
    property: "--panel-width",
    axis: "x",
    edge: "start",
    defaultSize: PANEL.defaultWidth,
    min: PANEL.minWidth,
    max: () => panelMaxWidth(window.innerWidth, document.querySelector("[data-run-row]")?.clientWidth),
  });
  return (
    <aside data-focus-area="panel" tabIndex={-1} style={hostStyle} className="relative flex w-(--panel-width) max-w-[min(70vw,calc(100%-360px))] min-w-90 shrink-0 flex-col border-l border-line bg-canvas outline-none">
      <div {...handleProps} aria-label="Resize the panel" className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize" />
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line px-2" role="tablist">
        {tabs.map((tab) => (
          <span
            key={tab.id}
            role="tab"
            aria-selected={tab.id === active}
            className="flex h-6 items-center gap-1 rounded-md ps-1.5 pe-2 text-xs text-ink-soft aria-selected:bg-hover-fill aria-selected:text-ink"
          >
            <Icon name={tab.icon} size={14} />
            {tab.label}
          </span>
        ))}
        <div className="flex-1" />
        <Button variant="ghost-muted" size="icon-xs" icon="x" aria-label="Close the panel" onClick={onClose} />
      </div>
      {children}
    </aside>
  );
}
