import { useState } from "react";
import { Icon } from "../../components/ui/Icon.tsx";
import type { Card } from "../../data/sampleCrew.ts";

/** What the deck is doing while it's made (the phone's decks/deck-card.tsx wording). */
const STATUS: Record<string, string> = { queued: "Getting started", outlining: "Planning the story", writing: "Writing slides", editing: "Updating slides" };

/**
 * A deck in the chat, as on the phone: a slide-shaped cover with its title, and while it's made,
 * what it's doing with a bar for slides written. Ready: how many slides, opening onto their titles.
 * Presenting and sharing stay on the phone for now. Only the bar's width changes as slides land.
 */
export function DeckCard({ card }: { card: Extract<Card, { type: "deck" }> }) {
  const [open, setOpen] = useState(false);
  const making = !["ready", "failed", "cancelled"].includes(card.status);
  const meta =
    card.status === "ready"
      ? `Presentation · ${card.built} slide${card.built === 1 ? "" : "s"}`
      : card.status === "failed"
        ? (card.error ?? "The deck couldn’t be made.")
        : card.status === "cancelled"
          ? "Stopped"
          : `${STATUS[card.status] ?? "Working"}${card.status === "writing" && card.total ? ` · ${card.built} of ${card.total}` : ""}`;
  return (
    <div className="w-full max-w-sm">
      <div className="relative flex aspect-video flex-col justify-end overflow-hidden rounded-xl border border-line bg-gradient-to-br from-raised to-soft p-4">
        <Icon name="file" size={16} className="absolute top-3 left-3 text-ink-soft" />
        <p className={making ? "line-clamp-2 text-base font-semibold live-shine" : "line-clamp-2 text-base font-semibold"}>{card.title}</p>
        {making && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-hover-fill">
            <div className="h-full bg-brand transition-[width] duration-500" style={{ width: `${card.total ? Math.max(6, (card.built / card.total) * 100) : 6}%` }} />
          </div>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-2 px-0.5 text-xs">
        <span className={card.status === "failed" ? "text-danger-ink" : "text-ink-soft"}>{meta}</span>
        {card.status === "ready" && card.slides.length > 0 && (
          <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="ms-auto flex items-center gap-0.5 text-ink-soft hover:text-ink">
            {open ? "Hide slides" : "Slides"}
            <Icon name="chevronDown" size={13} className={open ? "rotate-180" : undefined} />
          </button>
        )}
      </div>
      {open && (
        <ol className="mt-1 flex animate-fade flex-col gap-0.5 px-0.5 text-xs text-ink-soft">
          {card.slides.map((slide, index) => (
            <li key={slide.id} className="flex gap-2">
              <span className="w-4 shrink-0 text-end tabular-nums opacity-70">{index + 1}</span>
              <span className="min-w-0 truncate">{slide.title}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
