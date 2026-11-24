import type { ReactNode } from "react";
import { cn } from "../lib/utils.ts";

/**
 * The pieces every Settings page is made of, so they all read the same and stay quiet: a page with
 * a title and one line on what it's for, groups of rows, and rows with a label, an optional hint
 * and a control on the right.
 */

export function SettingsPage({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-7 px-5 py-5 min-[850px]:px-7">
      <header>
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-soft">{description}</p>}
      </header>
      {children}
    </div>
  );
}

export function Group({ title, description, children, className }: { title?: string; description?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-2", className)}>
      {(title || description) && (
        <div className="px-1">
          {title && <h3 className="text-sm font-medium">{title}</h3>}
          {description && <p className="text-xs text-ink-soft">{description}</p>}
        </div>
      )}
      <div className="divide-y divide-line rounded-xl border border-line">{children}</div>
    </section>
  );
}

export function Row({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center gap-4 px-3.5 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-sm">{label}</div>
        {hint && <div className="text-xs text-ink-soft">{hint}</div>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}

/** A compact choice for a row, like a shortcut or a time. */
export function Select<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; label: string }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
      className="h-8 cursor-pointer rounded-control border border-field-line bg-raised px-2 text-sm outline-none focus:border-brand"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
