import type { CSSProperties } from "react";
import type { Mate, Quote } from "../data/sampleCrew.ts";
import { cn } from "../lib/utils.ts";
import { MATE_PALETTE } from "../theme/matePalette.ts";
import { MateAvatar } from "./MateAvatar.tsx";

/**
 * Who you're answering, in their own colours: their face, their name in their colour, and one
 * line of what they said. Inside your bubble once sent (clicking it goes back there), and above
 * the box while you write.
 */
export function ReplyQuote({ quote, mate, name, onClick, className }: { quote: Quote; mate?: Mate; name: string; onClick?: () => void; className?: string }) {
  const tint = { "--tint": mate ? MATE_PALETTE[mate.color][1] : "var(--color-ink-soft)" } as CSSProperties;
  const body = (
    <>
      {mate && <MateAvatar mate={{ ...mate, status: "idle" }} size={14} still />}
      <span className="shrink-0 font-semibold text-(--tint)">{name}</span>
      <span className="min-w-0 truncate text-ink-soft">{quote.text}</span>
    </>
  );
  const shape = cn("flex min-w-0 items-center gap-1.5 text-xs leading-5", className);
  return onClick ? (
    <button type="button" style={tint} onClick={onClick} title={quote.text} className={cn(shape, "w-full cursor-pointer rounded-md text-left outline-none hover:[&>span:last-child]:text-ink focus-visible:ring-2 focus-visible:ring-brand")}>
      {body}
    </button>
  ) : (
    <span style={tint} className={shape}>
      {body}
    </span>
  );
}
