import { CANVAS, sceneHtml, sceneOf } from "@muse-clone/decks";
import { useLayoutEffect, useRef, useState } from "react";
import type { DeckContent } from "../../remote/decks.ts";

/** A slide's HTML, from the shared deck engine the phone and the PowerPoint export use; null if it can't be drawn yet. */
function slideHtml(deck: DeckContent, index: number) {
  try {
    return deck.slides[index] ? sceneHtml(sceneOf(deck, index)) : null;
  } catch {
    return null;
  }
}

/**
 * One slide, drawn at its real size (1280×720) and scaled to the width it's given, so the card,
 * the viewer and its thumbnails all show exactly what the PowerPoint will. The text in it is
 * escaped by the engine. A slide not written yet is a quiet placeholder.
 */
export function SlideView({ deck, index, className }: { deck: DeckContent; index: number; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = box.current!;
    const measure = () => setWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const html = slideHtml(deck, index);
  return (
    <div ref={box} className={`relative aspect-video overflow-hidden bg-soft ${className ?? ""}`}>
      {html && width > 0 && (
        <div
          className="absolute top-0 left-0 origin-top-left"
          style={{ width: CANVAS.width, height: CANVAS.height, transform: `scale(${width / CANVAS.width})` }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}
