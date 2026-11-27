import { useEffect, useState } from "react";
import { Button } from "../../components/ui/Button.tsx";
import { Dialog } from "../../components/ui/Dialog.tsx";
import { Icon } from "../../components/ui/Icon.tsx";
import type { Card } from "../../data/sampleCrew.ts";
import { deckBusy, useDeck, useDeckControls, type DeckContent } from "../../remote/decks.ts";
import { SlideView } from "./SlideView.tsx";

/** What the deck is doing while it's made (the phone's decks/deck-card.tsx wording). */
const STATUS: Record<string, string> = { queued: "Getting started", outlining: "Planning the story", writing: "Writing slides", editing: "Updating slides" };

/**
 * A deck in the chat, as on the phone: the real slide as its cover. While it's being made, the
 * cover is the newest slide as each one lands, with what it's doing and a bar for slides written;
 * ready, it's the first slide. Clicking opens the viewer. The reply's card is written once, so
 * the live deck comes from the API (remote/decks.ts). Stop while it's made; save as PowerPoint
 * when it's ready.
 */
export function DeckCard({ card: written }: { card: Extract<Card, { type: "deck" }> }) {
  const [viewing, setViewing] = useState<number | null>(null);
  const live = useDeck(written.deckId).data;
  const card = live ? { ...written, ...live } : written;
  const content = live?.content;
  const controls = useDeckControls(written.deckId);
  const making = deckBusy(card.status);
  const drawn = content?.slides.length ?? 0;
  const cover = making ? Math.max(0, drawn - 1) : 0;
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
      <button
        type="button"
        disabled={!drawn}
        onClick={() => setViewing(cover)}
        aria-label={`Open ${card.title}`}
        className="group relative block w-full overflow-hidden rounded-xl border border-line text-start outline-none focus-visible:ring-2 focus-visible:ring-brand enabled:cursor-zoom-in"
      >
        {content && drawn ? (
          <SlideView key={cover} deck={content} index={cover} className="animate-fade" />
        ) : (
          <div className="flex aspect-video flex-col justify-end bg-gradient-to-br from-raised to-soft p-4">
            <p className="line-clamp-2 text-base font-semibold live-shine">{card.title}</p>
          </div>
        )}
        {making && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/20">
            <div className="h-full bg-brand transition-[width] duration-500" style={{ width: `${card.total ? Math.max(6, (card.built / card.total) * 100) : 6}%` }} />
          </div>
        )}
      </button>
      <div className="mt-1.5 flex items-center gap-2 px-0.5 text-xs">
        <span className={card.status === "failed" ? "text-danger-ink" : "text-ink-soft"}>{meta}</span>
        {making && (
          <Button size="xs" variant="ghost" className="ms-auto" disabled={controls.busy === "stop"} onClick={() => void controls.stop()}>
            Stop
          </Button>
        )}
        {card.status === "ready" && (
          <Button size="xs" variant="ghost" icon="download" className="ms-auto" disabled={controls.busy === "save"} onClick={() => void controls.save(card.title)}>
            {controls.busy === "save" ? "Preparing…" : "PowerPoint"}
          </Button>
        )}
      </div>
      {controls.error && <p className="mt-1 px-0.5 text-xs text-danger-ink">{controls.error}</p>}
      {content && viewing !== null && <DeckViewer title={card.title} deck={content} start={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

/**
 * The deck large, as the phone's viewer: one slide at a time with ← and → (keys or buttons), where
 * you are, and every slide below to jump to. It follows the deck live while it's still being made.
 */
function DeckViewer({ title, deck, start, onClose }: { title: string; deck: DeckContent; start: number; onClose: () => void }) {
  const [index, setIndex] = useState(start);
  const count = deck.slides.length;
  const at = Math.min(index, count - 1);
  const go = (next: number) => setIndex(Math.max(0, Math.min(count - 1, next)));
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === "PageDown") go(at + 1);
      if (event.key === "ArrowLeft" || event.key === "PageUp") go(at - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={title} description={`Slide ${at + 1} of ${count}`} className="w-[min(72rem,calc(100vw-2.5rem))]">
      <div className="relative">
        <SlideView deck={deck} index={at} className="rounded-xl border border-line" />
        <Button variant="secondary" size="icon-sm" icon="chevronLeft" aria-label="Previous slide" disabled={at === 0} onClick={() => go(at - 1)} className="absolute top-1/2 left-2 -translate-y-1/2 shadow-md disabled:opacity-0" />
        <Button variant="secondary" size="icon-sm" icon="chevronRight" aria-label="Next slide" disabled={at >= count - 1} onClick={() => go(at + 1)} className="absolute top-1/2 right-2 -translate-y-1/2 shadow-md disabled:opacity-0" />
      </div>
      <ol className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {deck.slides.map((slide, slideIndex) => (
          <li key={slide.id} className="w-28 shrink-0">
            <button
              type="button"
              aria-label={`Slide ${slideIndex + 1}`}
              aria-current={slideIndex === at}
              onClick={() => go(slideIndex)}
              className="block w-full overflow-hidden rounded-md ring-offset-2 ring-offset-raised outline-none aria-current:ring-2 aria-current:ring-brand focus-visible:ring-2 focus-visible:ring-brand"
            >
              <SlideView deck={deck} index={slideIndex} />
            </button>
          </li>
        ))}
      </ol>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-soft">
        <Icon name="keyboard" size={13} />← and → move between slides
      </p>
    </Dialog>
  );
}
