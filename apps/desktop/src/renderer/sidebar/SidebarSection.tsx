import { Collapsible } from "@base-ui/react/collapsible";
import type { ReactNode } from "react";
import { Icon } from "../components/ui/Icon.tsx";

/** A labelled group of rows that folds away when you click its label; `defaultOpen={false}` starts folded. */
export function SidebarSection({ label, defaultOpen = true, children }: { label: string; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <Collapsible.Root defaultOpen={defaultOpen} render={<section />} className="flex flex-col gap-px">
      <Collapsible.Trigger
        className="group flex h-7 items-center gap-1 rounded-control px-(--sidebar-row-inset) text-2xs font-medium text-ink-soft outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset"
      >
        {label}
        <Icon name="chevronDown" size={12} className="-rotate-90 opacity-0 transition-[rotate,opacity] duration-150 group-aria-expanded:rotate-0 group-hover:opacity-100 group-focus-visible:opacity-100" />
      </Collapsible.Trigger>
      <Collapsible.Panel className="motion-disclosure" render={(props, state) => <div {...props} inert={!state.open} />}>
        <div className="flex flex-col gap-px">{children}</div>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
