import { Collapsible } from "@base-ui/react/collapsible";
import { use, useState } from "react";
import { AppLogo } from "../../components/AppLogo.tsx";
import { Button } from "../../components/ui/Button.tsx";
import { Icon } from "../../components/ui/Icon.tsx";
import type { Card, CardStatus, PlanAction } from "../../data/sampleCrew.ts";
import { usePlanUndo } from "../../remote/cardControls.ts";
import type { CardAction } from "./cardAnswers.logic.ts";
import { cn } from "../../lib/utils.ts";
import { MateAvatar } from "../MateAvatar.tsx";
import { CardAnswerLine, CardMatesContext, CardSurface, ComposeContext, QuietAction } from "./CardParts.tsx";
import { chosenActions, planSummary } from "./cards.logic.ts";

/**
 * What a mate found in an app: a short list, newest first, the way the app itself would show it.
 * A result with a link opens it in your browser, and a follow-up ("Reply to Ama") puts its words in
 * the composer for you to send, as on the phone.
 */
export function ResultsCard({ card }: { card: Extract<Card, { type: "results" }> }) {
  const compose = use(ComposeContext);
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
              {item.url ? (
                <a href={item.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                  {item.title}
                </a>
              ) : (
                item.title
              )}
              {item.snippet && <span className="text-ink-soft"> — {item.snippet}</span>}
            </span>
          </li>
        ))}
      </ul>
      {compose && card.followUps && card.followUps.length > 0 && (
        <footer className="flex flex-wrap gap-1.5 border-t border-line px-4 py-2.5">
          {card.followUps.map((followUp) => (
            <Button key={followUp.label} size="xs" variant="outline" onClick={() => compose(followUp.prompt)}>
              {followUp.label}
            </Button>
          ))}
        </footer>
      )}
    </CardSurface>
  );
}

function StepMark({ action, state }: { action: PlanAction; state: Extract<Card, { type: "plan" }>["state"] }) {
  if (action.status === "done") return <Icon name="check" size={14} className="text-ok-ink" />;
  if (action.status === "failed") return <Icon name="alert" size={14} className="text-danger-ink" />;
  if (action.status === "running") return <span className="size-3 animate-spin rounded-full border-[1.5px] border-ink-soft border-r-transparent" />;
  if (action.status === "skipped" || (state !== "review" && !action.selected)) return <span className="h-px w-2.5 rounded-full bg-ink-soft/50" />;
  if (state === "running") return <span className="size-3 animate-spin rounded-full border-[1.5px] border-ink-soft border-r-transparent" />;
  return <span className="size-1.5 rounded-full bg-ink-soft/40" />;
}

/**
 * What a mate is about to do, for one OK: a line per action with its app, each one yours to untick.
 * Go ahead runs the ones still ticked (approve:<ids>, as on the phone) and Not now leaves them; once
 * it runs, the ticks become each action's progress, a failed one says why, and a done one can be
 * undone where the app allows it.
 */
export function PlanCard({ card, onChange, onAction, status }: { card: Extract<Card, { type: "plan" }>; onChange: (card: Card) => void; onAction?: (action: CardAction) => void; status?: CardStatus }) {
  const real = Boolean(onAction && card.resumeRunId);
  // Which actions you've ticked, on this card until you answer; a sample card keeps them in the chat.
  const [ticked, setTicked] = useState(() => new Set(card.actions.filter((action) => action.selected).map((action) => action.id)));
  const shown: typeof card = real ? { ...card, actions: card.actions.map((action) => ({ ...action, selected: ticked.has(action.id) })) } : card;
  const review = shown.state === "review";
  const chosen = chosenActions(shown).length;
  const pending = status && "pending" in status;
  const undo = usePlanUndo();

  const toggle = (id: string) => {
    if (!real) return onChange({ ...card, actions: card.actions.map((action) => (action.id === id ? { ...action, selected: !action.selected } : action)) });
    const next = new Set(ticked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setTicked(next);
  };

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
        <p className="text-xs text-ink-soft">{planSummary(shown)}</p>
      </header>
      <ul className="py-1">
        {shown.actions.map((action) => {
          const off = !action.selected || action.status === "skipped";
          const row = (
            <>
              <span className="flex size-4 shrink-0 items-center justify-center">
                {review ? (
                  <span className={cn("flex size-3.5 items-center justify-center rounded-[4px] border transition-colors duration-150", action.selected ? "border-ink bg-ink text-canvas" : "border-ink-soft/50 bg-transparent")}>
                    {action.selected && <Icon name="check" size={10} />}
                  </span>
                ) : (
                  <StepMark action={action} state={shown.state} />
                )}
              </span>
              <AppLogo name={action.app.name} slug={action.app.slug} size={18} />
              <span className={cn("min-w-0 flex-1 truncate text-sm transition-colors", off && "text-ink-soft line-through decoration-ink-soft/40")}>
                {action.label}
                {action.detail && <span className="text-ink-soft"> · {action.detail}</span>}
                {action.error && <span className="block truncate text-xs text-danger-ink">{action.error}</span>}
              </span>
              {action.status === "done" && action.undo && (
                <span className="shrink-0 text-xs">
                  {undo.state[action.id] === "done" ? (
                    <span className="text-ink-soft">Undone</span>
                  ) : (
                    <QuietAction onClick={() => void undo.run(action.id, action.undo!)}>{undo.state[action.id] === "busy" ? "Undoing…" : "Undo"}</QuietAction>
                  )}
                </span>
              )}
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
        <footer className="flex flex-col gap-2 border-t border-line px-4 py-2.5">
          {!pending && (
            <div className="flex items-center gap-2">
              <Button size="sm" disabled={chosen === 0} onClick={() => (real ? onAction!({ type: "plan", actionIds: chosenActions(shown).map((action) => action.id) }) : onChange({ ...card, state: "running" }))}>
                {chosen === card.actions.length ? "Go ahead" : `Do ${chosen}`}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => (real ? onAction!({ type: "planDecline" }) : onChange({ ...card, state: "declined" }))}>
                Not now
              </Button>
            </div>
          )}
          <CardAnswerLine status={status} />
        </footer>
      )}
      {undo.error && <p role="alert" className="px-4 pb-2.5 text-xs text-danger-ink">{undo.error}</p>}
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
