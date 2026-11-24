/** The thin "or" line between two ways of doing the same thing. */
export function OrDivider() {
  return (
    <div role="separator" className="flex items-center gap-3 text-xs text-ink-soft before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
      or
    </div>
  );
}
