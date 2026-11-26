import { Icon } from "../../components/ui/Icon.tsx";
import type { Card } from "../../data/sampleCrew.ts";
import { Favicon } from "../Favicon.tsx";
import { CardPopover, QuietAction, Sparkle } from "./CardParts.tsx";
import { memoryLabel, sourcesPill } from "./cards.logic.ts";

/**
 * The cards that aren't boxes: they sit under an answer like a footnote. Sources is a pill of
 * site icons that opens the list; a memory is one quiet line that opens what was remembered.
 */

export function SourcesPill({ card }: { card: Extract<Card, { type: "sources" }> }) {
  const { domains, label } = sourcesPill(card.sources);
  // Each site's icon as the API names it (the same the phone shows), else its first letter.
  const iconOf = (domain: string) => card.sources.find((source) => source.domain === domain)?.favicon;
  return (
    <CardPopover
      label="Sources"
      trigger={
        <button
          type="button"
          className="flex h-7 w-fit items-center gap-2 rounded-full border border-line bg-raised ps-1 pe-2.5 text-xs font-medium text-ink-soft outline-none transition-colors duration-150 hover:bg-hover-fill hover:text-ink focus-visible:ring-2 focus-visible:ring-brand data-popup-open:bg-hover-fill data-popup-open:text-ink"
        >
          <span className="flex -space-x-1.5">
            {domains.map((domain) => (
              <Favicon key={domain} domain={domain} src={iconOf(domain)} size={18} className="rounded-full bg-raised ring-2 ring-raised" />
            ))}
          </span>
          {label}
        </button>
      }
    >
      <p className="px-2.5 pt-1.5 pb-1 text-2xs font-medium text-ink-soft">Sources</p>
      <ul>
        {card.sources.map((source) => (
          <li key={source.id}>
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="group flex items-start gap-2.5 rounded-lg px-2.5 py-2 outline-none transition-colors duration-100 hover:bg-hover-fill focus-visible:bg-hover-fill"
            >
              <Favicon domain={source.domain} src={source.favicon} size={18} className="mt-0.5 rounded-full" />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-[13px] leading-snug">{source.title}</span>
                <span className="text-2xs text-ink-soft">
                  {source.domain.replace(/^www\./, "")}
                  {source.published ? ` · ${source.published}` : ""}
                </span>
              </span>
              <Icon name="external" size={13} className="mt-0.5 shrink-0 text-ink-soft opacity-0 transition-opacity group-hover:opacity-100" />
            </a>
          </li>
        ))}
      </ul>
    </CardPopover>
  );
}

export function MemoryLine({ card, onChange }: { card: Extract<Card, { type: "memory" }>; onChange: (card: Card) => void }) {
  const label = memoryLabel(card);
  if (card.undone) {
    return <p className="flex items-center gap-1.5 text-xs text-ink-soft/70 italic">{label}</p>;
  }
  return (
    <CardPopover
      label="What was remembered"
      trigger={
        <button
          type="button"
          className="group flex w-fit items-center gap-1.5 rounded-md text-xs text-ink-soft italic outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Sparkle className="memory-sparkle text-brand" />
          <span className="memory-sweep pe-1 py-px">{label}</span>
        </button>
      }
    >
      <div className="flex flex-col gap-2 p-2.5">
        <p className="flex items-center gap-1.5 text-2xs font-medium text-ink-soft">
          <Sparkle className="size-3 text-brand" />
          {card.action === "forgotten" ? "No longer remembered" : "Your mates will remember"}
        </p>
        <p className="leading-snug select-text">{card.text}</p>
        <div className="-mx-1.5 flex gap-1">
          <QuietAction onClick={() => onChange({ ...card, undone: true })}>Undo</QuietAction>
        </div>
      </div>
    </CardPopover>
  );
}
