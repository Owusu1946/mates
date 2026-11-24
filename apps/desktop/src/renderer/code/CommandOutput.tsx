import { cn } from "../lib/utils.ts";
import { ansiSpans, type Tone } from "./ansi.logic.ts";

const TONE_CLASS: Record<Tone, string> = { red: "text-danger-ink", green: "text-ok-ink", yellow: "text-caution-ink", blue: "text-brand", dim: "opacity-60" };

/**
 * A command's output in its row, with the colours it printed, as T3 Code's CommandOutputPanel.
 * It's mounted only while the row is open, so closed rows hold no output.
 */
export function CommandOutput({ text }: { text: string }) {
  const spans = ansiSpans(text.replaceAll("\r", ""));
  return (
    <pre className="max-h-80 overflow-auto rounded-md bg-soft px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap text-ink-soft">
      {spans.map((span, index) =>
        span.tone === null && !span.bold ? (
          span.text
        ) : (
          // Spans never reorder.
          <span key={index} className={cn(span.tone && TONE_CLASS[span.tone], span.bold && "font-semibold")}>
            {span.text}
          </span>
        ),
      )}
    </pre>
  );
}
