import type { Card } from "../../data/sampleCrew.ts";

/** A group's mission: the goal, who's on it now, and how far along it is. */
export function TeamCard({ card }: { card: Extract<Card, { type: "mission" }> }) {
  return (
    <section className="rounded-xl border border-line bg-raised p-4">
      <div className="text-2xs font-medium text-ink-soft">Mission</div>
      <h3 className="mt-1 text-[15px] font-semibold">{card.goal}</h3>
      <div className="mt-3 flex items-center gap-3">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-hover-fill" role="progressbar" aria-valuemin={0} aria-valuemax={card.total} aria-valuenow={card.done}>
          <div className="h-full rounded-full bg-brand" style={{ width: `${(card.done / card.total) * 100}%` }} />
        </div>
        <span className="text-xs text-ink-soft tabular-nums">
          {card.done}/{card.total}
        </span>
      </div>
      <p className="mt-2 text-xs text-ink-soft">{card.working}</p>
    </section>
  );
}
