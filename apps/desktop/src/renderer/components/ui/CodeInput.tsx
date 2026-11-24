import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";

const LENGTH = 6;

/**
 * Six boxes for an emailed code. Typing moves to the next box, Backspace to the one before, and a
 * pasted code fills them all; `onComplete` fires once all six are in.
 */
export function CodeInput({ value, onChange, onComplete, label }: { value: string; onChange: (code: string) => void; onComplete: (code: string) => void; label: string }) {
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: LENGTH }, (_, i) => value[i] ?? "");

  function set(next: string, focus: number) {
    const code = next.replace(/\D/g, "").slice(0, LENGTH);
    onChange(code);
    boxes.current[Math.min(focus, LENGTH - 1)]?.focus();
    if (code.length === LENGTH) onComplete(code);
  }

  function onKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      event.preventDefault();
      set(value.slice(0, index - 1), index - 1);
    }
    if (event.key === "ArrowLeft") boxes.current[index - 1]?.focus();
    if (event.key === "ArrowRight") boxes.current[index + 1]?.focus();
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "");
    if (pasted) set(pasted, pasted.length);
  }

  return (
    <div className="flex justify-center gap-2" role="group" aria-label={label}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => {
            boxes.current[index] = element;
          }}
          value={digit}
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${index + 1}`}
          maxLength={1}
          autoFocus={index === 0}
          className="h-13 w-11 rounded-lg border border-field-line bg-canvas text-center text-xl font-semibold tabular-nums shadow-xs/5 outline-none transition-shadow focus:border-brand focus:ring-[3px] focus:ring-brand/20 dark:bg-field-line/30"
          onChange={(event) => {
            const typed = event.target.value.replace(/\D/g, "").slice(-1);
            if (!typed) return set(value.slice(0, index) + value.slice(index + 1), index);
            set(value.slice(0, index) + typed + value.slice(index + 1), index + 1);
          }}
          onKeyDown={(event) => onKeyDown(index, event)}
          onPaste={onPaste}
        />
      ))}
    </div>
  );
}
