import { Collapsible } from "@base-ui/react/collapsible";
import { use, useEffect } from "react";
import { AppLogo } from "../../components/AppLogo.tsx";
import { Button } from "../../components/ui/Button.tsx";
import { Icon } from "../../components/ui/Icon.tsx";
import type { Card, PlanAction } from "../../data/sampleCrew.ts";
import { cn } from "../../lib/utils.ts";
import { MateAvatar } from "../MateAvatar.tsx";
import { CardMatesContext, CardSurface } from "./CardParts.tsx";
import { advancePlan, chosenActions, planSummary } from "./cards.logic.ts";

/** How long each step of a plan takes in the sample, so you can watch it go. */
const SAMPLE_STEP_MS = 700;

/** What a mate found in an app: a short list, newest first, the way the app itself would show it. */
export function ResultsCard({ card }: { card: Extract<Card, { type: "results" }> }) {
  return (
    <CardSurface>
      <header className="flex items-center gap-2.5 px-4 pt-3 pb-2">
        <AppLogo name={card.app.name} slug={card.app.slug} size={20} />
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{card.title}</h3>
        <span className="text-xs text-ink-soft">{card.app.name}</span>
      </header>
      <ul className="pb-1.5">
        {card.items.map((item) => (
          <li key={item.id} className="grid grid-cols-[0.5rem_minmax(0,1fr)_auto] items-baseline gap-x-2.5 px-4 py-2 transition-colors duration-100 hover:bg-hover-fill">
            <span className={cn("size-1.5 translate-y-[-1px] rounded-full", item.unread ? "bg-brand" : "bg-transparent")} aria-label={item.unread ? "Unread" : undefined} />
            <span className={cn("truncate text-sm", item.unread && "font-semibold")}>{item.from}</span>
            <span className="text-2xs text-ink-soft tabular-nums">{item.time}</span>
            <span className="col-start-2 col-end-4 truncate text-[13px]">
              {item.title}
              <span className="text-ink-soft"> — {item.snippet}</span>
            </span>
          </li>
        ))}
      </ul>
    </CardSurface>
  );
}

function StepMark({ action, state }: { action: PlanAction; state: Extract<Card, { type: "plan" }>["state"] }) {
  if (action.status === "done") return <Icon name="check" size={14} className="text-ok-ink" />;
  if (action.status === "skipped" || (state !== "review" && !action.selected)) return <span className="h-px w-2.5 rounded-full bg-ink-soft/50" />;
  if (state === "running") return <span className="size-3 animate-spin rounded-full border-[1.5px] border-ink-soft border-r-transparent" />;
  return <span className="size-1.5 rounded-full bg-ink-soft/40" />;
}

/**
 * What a mate is about to do, for one OK: a line per action with its app, each one yours to untick.
 * Once it runs, the ticks become progress; afterwards, a record of what was done.
 */
export function PlanCard({ card, onChange }: { card: Extract<Card, { type: "plan" }>; onChange: (card: Card) => void }) {
  const review = card.state === "review";
  const chosen = chosenActions(card).length;

  useEffect(() => {
    if (card.state !== "running") return;
    const timer = setTimeout(() => onChange(advancePlan(card)), SAMPLE_STEP_MS);
    return () => clearTimeout(timer);
  }, [card, onChange]);

  const toggle = (id: string) => onChange({ ...card, actions: card.actions.map((action) => (action.id === id ? { ...action, selected: !action.selected } : action)) });

  return (
    <CardSurface>
      <header className="px-4 pt-3 pb-1">
        {review && (
          <p className="mb-1 flex items-center gap-1.5 text-2xs font-medium text-caution-ink">
            <span className="size-1.5 rounded-full bg-caution" aria-hidden="true" />
            Needs your OK
          </p>
        )}
        <h3 className="text-sm font-semibold">{card.title}</h3>
        <p className="text-xs text-ink-soft">{planSummary(card)}</p>
      </header>
      <ul className="py-1">
        {card.actions.map((action) => {
          const off = !action.selected || action.status === "skipped";
          const row = (
            <>
              <span className="flex size-4 shrink-0 items-center justify-center">
                {review ? (
                  <span className={cn("flex size-3.5 items-center justify-center rounded-[4px] border transition-colors duration-150", action.selected ? "border-ink bg-ink text-canvas" : "border-ink-soft/50 bg-transparent")}>
                    {action.selected && <Icon name="check" size={10} />}
                  </span>
                ) : (
                  <StepMark action={action} state={card.state} />
                )}
              </span>
              <AppLogo name={action.app.name} slug={action.app.slug} size={18} />
              <span className={cn("min-w-0 flex-1 truncate text-sm transition-colors", off && "text-ink-soft line-through decoration-ink-soft/40")}>
                {action.label}
                {action.detail && <span className="text-ink-soft"> · {action.detail}</span>}
              </span>
            </>
          );
          return (
            <li key={action.id}>
              {review ? (
                <button type="button" role="checkbox" aria-checked={action.selected} onClick={() => toggle(action.id)} className="flex min-h-9 w-full items-center gap-2.5 px-4 text-left outline-none transition-colors duration-100 hover:bg-hover-fill focus-visible:bg-hover-fill">
                  {row}
                </button>
              ) : (
                <div className="flex min-h-9 items-center gap-2.5 px-4">{row}</div>
              )}
            </li>
          );
        })}
      </ul>
      {review && (
        <footer className="flex items-center gap-2 border-t border-line px-4 py-2.5">
          <Button size="sm" disabled={chosen === 0} onClick={() => onChange({ ...card, state: "running" })}>
            {chosen === card.actions.length ? "Go ahead" : `Do ${chosen}`}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onChange({ ...card, state: "declined" })}>
            Not now
          </Button>
        </footer>
      )}
    </CardSurface>
  );
}

/** The lead's call after several mates weighed in (the lead's name is already above it), with how each one saw it a click away. */
export function ComparisonCard({ card }: { card: Extract<Card, { type: "comparison" }> }) {
  const mates = use(CardMatesContext);
  return (
    <CardSurface>
      <div className="px-4 pt-3 pb-3">
        <p className="mb-1 text-2xs font-medium text-ink-soft">Recommendation</p>
        <p className="text-[15px] leading-relaxed select-text">{card.suggestion}</p>
      </div>
      <Collapsible.Root>
        <Collapsible.Trigger className="group flex h-9 w-full items-center gap-1.5 border-t border-line px-4 text-xs font-medium text-ink-soft outline-none transition-colors hover:text-ink focus-visible:bg-hover-fill">
          <Icon name="chevronDown" size={14} className="-rotate-90 transition-transform duration-200 group-data-panel-open:rotate-0" />
          How each mate saw it
          <span className="ms-auto flex -space-x-1">
            {card.perMate.map((entry) => mates[entry.mateId] && <MateAvatar key={entry.mateId} mate={{ ...mates[entry.mateId]!, status: "idle" }} size={16} still />)}
          </span>
        </Collapsible.Trigger>
        <Collapsible.Panel className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 ease-out data-ending-style:h-0 data-starting-style:h-0">
          <ul className="flex flex-col gap-3 px-4 pt-1 pb-3.5">
            {card.perMate.map((entry) => {
              const mate = mates[entry.mateId];
              return (
                <li key={entry.mateId} className="flex gap-2.5">
                  {mate && <MateAvatar mate={{ ...mate, status: "idle" }} size={20} still />}
                  <div className="min-w-0 text-sm">
                    <p>
                      <span className="font-medium">{mate?.name}</span> <span className="text-ink-soft">· {mate?.role}</span>
                    </p>
                    <p className="select-text">{entry.recommendation}</p>
                    <p className="text-xs text-ink-soft select-text">{entry.basis}</p>
                  </div>
                </li>
              );
            })}
            {card.disagreements.length > 0 && (
              <li className="rounded-lg bg-soft px-3 py-2 text-xs">
                <p className="mb-0.5 font-medium">Where they differ</p>
                {card.disagreements.map((line) => (
                  <p key={line} className="text-ink-soft select-text">
                    {line}
                  </p>
                ))}
              </li>
            )}
          </ul>
        </Collapsible.Panel>
      </Collapsible.Root>
    </CardSurface>
  );
}
