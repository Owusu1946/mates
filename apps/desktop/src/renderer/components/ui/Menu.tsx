import { Menu as BaseMenu } from "@base-ui/react/menu";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { cn } from "../../lib/utils.ts";
import { Icon, type IconName } from "./Icon.tsx";

/**
 * A dropdown menu on Base UI, as T3 Code builds theirs (components/ui/menu.tsx): Base UI owns
 * focus, keyboard and positioning; this owns the look.
 */
export function Menu({ trigger, children, side = "bottom", align = "start" }: { trigger: ReactElement; children: ReactNode; side?: "top" | "bottom"; align?: "start" | "end" }) {
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger render={trigger} />
      <BaseMenu.Portal>
        <BaseMenu.Positioner side={side} align={align} sideOffset={6} className="z-50 outline-none">
          <BaseMenu.Popup className="motion-popover min-w-52 origin-(--transform-origin) rounded-xl border border-line bg-raised p-1 text-sm text-ink shadow-lg shadow-black/10 outline-none dark:shadow-black/50">
            {children}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}

export function MenuItem({ icon, children, className, ...rest }: ComponentProps<typeof BaseMenu.Item> & { icon?: IconName; children: ReactNode }) {
  return (
    <BaseMenu.Item
      className={cn("flex h-8 cursor-default items-center gap-2 rounded-lg px-2 outline-none transition-colors duration-100 select-none data-highlighted:bg-hover-fill [&_svg]:size-4 [&_svg]:text-ink-soft", className)}
      {...rest}
    >
      {icon && <Icon name={icon} />}
      {children}
    </BaseMenu.Item>
  );
}

/** A set of choices where one is on, like the colour scheme. The menu stays open while you choose. */
export function MenuRadioGroup<T extends string>({ value, onChange, children }: { value: T; onChange: (value: T) => void; children: ReactNode }) {
  return (
    <BaseMenu.RadioGroup value={value} onValueChange={(next) => onChange(next as T)}>
      {children}
    </BaseMenu.RadioGroup>
  );
}

export function MenuRadioItem({ value, icon, children }: { value: string; icon?: IconName; children: ReactNode }) {
  return (
    <BaseMenu.RadioItem
      value={value}
      closeOnClick={false}
      className="flex h-8 cursor-default items-center gap-2 rounded-lg px-2 outline-none transition-colors duration-100 select-none data-highlighted:bg-hover-fill [&_svg]:size-4 [&_svg]:text-ink-soft"
    >
      {icon && <Icon name={icon} />}
      <span className="flex-1">{children}</span>
      <BaseMenu.RadioItemIndicator className="flex">
        <Icon name="check" className="text-ink!" />
      </BaseMenu.RadioItemIndicator>
    </BaseMenu.RadioItem>
  );
}

/**
 * A few choices side by side in one row, like System / Light / Dark: icon buttons that stay in
 * the menu's keyboard order. Each needs a label for screen readers and the tooltip.
 */
export function MenuSegmented<T extends string>({ value, onChange, options }: { value: T; onChange: (value: T) => void; options: { value: T; label: string; icon: IconName }[] }) {
  return (
    <BaseMenu.RadioGroup value={value} onValueChange={(next) => onChange(next as T)} className="flex gap-0.5 rounded-lg bg-soft p-0.5">
      {options.map((option) => (
        <BaseMenu.RadioItem
          key={option.value}
          value={option.value}
          closeOnClick={false}
          aria-label={option.label}
          title={option.label}
          className="flex h-7 flex-1 cursor-default items-center justify-center rounded-md text-ink-soft outline-none transition-colors duration-100 select-none data-checked:bg-raised data-checked:text-ink data-checked:shadow-xs data-highlighted:text-ink [&_svg]:size-4"
        >
          <Icon name={option.icon} />
        </BaseMenu.RadioItem>
      ))}
    </BaseMenu.RadioGroup>
  );
}

/** A row that opens a second menu beside it, for a longer list such as the themes. */
export function MenuSubmenu({ icon, label, detail, children }: { icon?: IconName; label: string; detail?: ReactNode; children: ReactNode }) {
  return (
    <BaseMenu.SubmenuRoot>
      <BaseMenu.SubmenuTrigger
        openOnHover
        delay={80}
        className="flex h-8 cursor-default items-center gap-2 rounded-lg px-2 outline-none transition-colors duration-100 select-none data-highlighted:bg-hover-fill data-popup-open:bg-hover-fill [&_svg]:size-4 [&_svg]:text-ink-soft"
      >
        {icon && <Icon name={icon} />}
        <span className="flex-1">{label}</span>
        {detail && <span className="flex items-center gap-1.5 text-xs text-ink-soft">{detail}</span>}
        <Icon name="arrowRight" className="size-3.5!" />
      </BaseMenu.SubmenuTrigger>
      <BaseMenu.Portal>
        <BaseMenu.Positioner side="right" align="start" sideOffset={6} alignOffset={-4} className="z-50 outline-none">
          <BaseMenu.Popup className="motion-popover min-w-48 origin-(--transform-origin) rounded-xl border border-line bg-raised p-1 text-sm text-ink shadow-lg shadow-black/10 outline-none dark:shadow-black/50">
            {children}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.SubmenuRoot>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-2 pt-1.5 pb-1 text-2xs font-medium text-ink-soft">{children}</div>;
}

export function MenuSeparator() {
  return <div role="separator" className="-mx-1 my-1 h-px bg-line" />;
}
