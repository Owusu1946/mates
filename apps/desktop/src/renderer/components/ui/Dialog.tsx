import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import type { ReactNode } from "react";
import { buttonVariants } from "./Button.tsx";
import { Icon } from "./Icon.tsx";

/**
 * A small dialog on Base UI, styled like Settings: it traps focus, closes on Escape or a click
 * outside, and opens and closes with the app's dialog motion.
 */
export function Dialog({ open, onOpenChange, title, description, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; children: ReactNode }) {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="motion-backdrop fixed inset-0 z-50 bg-black/25 backdrop-blur-[2px] dark:bg-black/55" />
        <BaseDialog.Popup className="motion-dialog fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-3rem)] w-[min(28rem,calc(100vw-2.5rem))] -translate-1/2 flex-col overflow-hidden rounded-2xl border border-line bg-raised text-ink shadow-2xl shadow-black/20 outline-none">
          <header className="flex items-start justify-between gap-3 px-5 pt-4">
            <div>
              <BaseDialog.Title className="text-base font-semibold">{title}</BaseDialog.Title>
              {description && <BaseDialog.Description className="mt-0.5 text-sm text-ink-soft">{description}</BaseDialog.Description>}
            </div>
            <BaseDialog.Close aria-label="Close" className={buttonVariants({ variant: "ghost-muted", size: "icon-sm" })}>
              <Icon name="x" />
            </BaseDialog.Close>
          </header>
          <div className="min-h-0 overflow-y-auto px-5 pt-4 pb-5">{children}</div>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
