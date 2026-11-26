import { Icon } from "../../components/ui/Icon.tsx";
import type { Card } from "../../data/sampleCrew.ts";
import { CardGlyph, CardSurface } from "./CardParts.tsx";

/** How it stands, at a glance: working, done, waiting on you, or it hit a problem. */
function StateMark({ state }: { state: Extract<Card, { type: "summary" }>["state"] }) {
  if (state === "running") return <span className="size-3 shrink-0 animate-spin rounded-full border-[1.5px] border-ink-soft border-r-transparent" aria-label="Working" />;
  if (state === "done") return <Icon name="check" size={14} className="shrink-0 text-ok-ink" />;
  if (state === "error") return <Icon name="alert" size={14} className="shrink-0 text-danger-ink" />;
  return <span className="size-1.5 shrink-0 rounded-full bg-caution" aria-label="Needs you" />;
}

/**
 * Everything else a mate shows (a task on its computer, a deck, a page, a ride, a call, who it
 * handed work to): what it is and how it stands, in one compact row. When it's waiting for you and
 * the desktop can't answer it yet, it says to open your phone.
 */
export function SummaryCard({ card }: { card: Extract<Card, { type: "summary" }> }) {
  return (
    <CardSurface>
      <div className="flex items-start gap-3 px-4 py-3">
        <CardGlyph>
          <Icon name={card.icon} />
        </CardGlyph>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-medium">
            <span className="min-w-0 truncate">{card.title}</span>
            <StateMark state={card.state} />
          </p>
          {card.detail && <p className="mt-0.5 line-clamp-2 select-text text-xs text-ink-soft">{card.detail}</p>}
          {card.onPhone && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-caution-ink">
              <Icon name="phone" size={13} />
              Open Mates on your phone to answer this
            </p>
          )}
        </div>
      </div>
    </CardSurface>
  );
}
