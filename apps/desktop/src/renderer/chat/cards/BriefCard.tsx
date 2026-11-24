import { Button } from "../../components/ui/Button.tsx";
import type { Card } from "../../data/sampleCrew.ts";

/** The morning brief: one line per part of the day, with the one thing to do about it. */
export function BriefCard({ card }: { card: Extract<Card, { type: "brief" }> }) {
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-raised">
      <h3 className="px-4 pt-3.5 pb-2 text-[15px] font-semibold">{card.title}</h3>
      <ul className="divide-y divide-line">
        {card.rows.map((row) => (
          <li key={row.label} className="flex min-h-11 items-center gap-3 px-4 py-2">
            <span className="w-18 shrink-0 text-xs text-ink-soft">{row.label}</span>
            <span className="min-w-0 flex-1 select-text">{row.text}</span>
            {row.action && (
              <Button variant="outline" size="xs">
                {row.action}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
