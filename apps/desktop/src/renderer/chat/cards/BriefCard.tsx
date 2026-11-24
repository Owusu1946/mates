import type { Card } from "../../data/sampleCrew.ts";

/** The morning brief: one line per part of the day. */
export function BriefCard({ card }: { card: Extract<Card, { type: "brief" }> }) {
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-raised">
      <h3 className="border-b border-line px-4 py-3 text-[15px] font-semibold">{card.title}</h3>
      <ul className="divide-y divide-line">
        {card.rows.map((row) => (
          <li key={row.label} className="grid min-h-10 grid-cols-[4.25rem_minmax(0,1fr)] items-baseline gap-3 px-4 py-2.5">
            <span className="text-xs text-ink-soft">{row.label}</span>
            <span className="select-text">{row.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
