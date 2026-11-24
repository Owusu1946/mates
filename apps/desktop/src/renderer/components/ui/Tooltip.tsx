import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type { ReactElement, ReactNode } from "react";

/** A tooltip on Base UI. Wrap the app in TooltipProvider so neighbouring tips open without a fresh delay. */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return <BaseTooltip.Provider delay={400}>{children}</BaseTooltip.Provider>;
}

export function Tooltip({ content, children, side = "right" }: { content: ReactNode; children: ReactElement; side?: "top" | "right" | "bottom" | "left" }) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner side={side} sideOffset={8} className="z-50">
          <BaseTooltip.Popup className="motion-tooltip max-w-64 origin-(--transform-origin) rounded-lg border border-line bg-raised px-2.5 py-1.5 text-xs text-ink shadow-md shadow-black/10 dark:shadow-black/50">
            {content}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
