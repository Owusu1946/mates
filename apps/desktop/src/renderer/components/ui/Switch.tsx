import { cn } from "../../lib/utils.ts";

/** An on/off switch: brand when on, with the knob sliding across. */
export function Switch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={cn("relative h-5 w-9 shrink-0 rounded-full outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-canvas", on ? "bg-brand" : "bg-field-line")}>
      <span className={cn("absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-xs transition-[translate] duration-150 ease-out-soft", on && "translate-x-4")} />
    </button>
  );
}
