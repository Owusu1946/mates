import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/utils.ts";

/**
 * T3 Code's input frame (components/ui/input.tsx, textarea.tsx): a hairline field that turns the
 * accent on focus, with a soft 1px top highlight. The error, when there is one, replaces the hint.
 */
const frame =
  "relative flex w-full rounded-lg border border-field-line bg-canvas text-ink shadow-xs/5 transition-shadow has-focus-visible:border-brand has-focus-visible:ring-[3px] has-focus-visible:ring-brand/20 has-aria-invalid:border-danger/60 has-focus-visible:has-aria-invalid:ring-danger/16 dark:bg-field-line/30";

type FieldShell = { label: string; hint?: string | null; error?: string | null; srOnlyLabel?: boolean };

function Field({ id, label, hint, error, srOnlyLabel, children }: FieldShell & { id: string; children: ReactNode }) {
  const note = error ?? hint;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={cn("text-xs font-medium text-ink-soft", srOnlyLabel && "sr-only")}>
        {label}
      </label>
      {children}
      {note && (
        <p id={`${id}-note`} role={error ? "alert" : undefined} className={cn("text-xs", error ? "text-danger-ink" : "text-ink-soft")}>
          {note}
        </p>
      )}
    </div>
  );
}

type TextFieldProps = FieldShell & Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "id">;

export function TextField({ label, hint, error, srOnlyLabel, ...input }: TextFieldProps) {
  const id = useId();
  return (
    <Field id={id} label={label} hint={hint} error={error} srOnlyLabel={srOnlyLabel}>
      <span className={frame}>
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={(error ?? hint) ? `${id}-note` : undefined}
          className="h-10 w-full min-w-0 rounded-[inherit] bg-transparent px-3 text-[15px] outline-none placeholder:text-ink-soft/80"
          {...input}
        />
      </span>
    </Field>
  );
}

type TextAreaProps = FieldShell & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className" | "id">;

export function TextArea({ label, hint, error, srOnlyLabel, ...area }: TextAreaProps) {
  const id = useId();
  return (
    <Field id={id} label={label} hint={hint} error={error} srOnlyLabel={srOnlyLabel}>
      <span className={frame}>
        <textarea
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={(error ?? hint) ? `${id}-note` : undefined}
          className="min-h-24 w-full resize-none rounded-[inherit] bg-transparent px-3 py-2.5 text-[15px] leading-relaxed outline-none [field-sizing:content] placeholder:text-ink-soft/80"
          {...area}
        />
      </span>
    </Field>
  );
}
