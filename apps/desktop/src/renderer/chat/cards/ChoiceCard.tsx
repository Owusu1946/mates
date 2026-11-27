import { AppLogo } from "../../components/AppLogo.tsx";
import { Icon } from "../../components/ui/Icon.tsx";
import type { Card, CardStatus } from "../../data/sampleCrew.ts";
import type { CardAction } from "./cardAnswers.logic.ts";
import { CardAnswerLine, CardSurface } from "./CardParts.tsx";

/**
 * Pick one: which account, which app. Picking carries the reply on with that option (the phone's
 * AppResponseCard); once it has, the card shows the question answered.
 */
export function ChoiceCard({ card, onAction, status }: { card: Extract<Card, { type: "choice" }>; onAction?: (action: CardAction) => void; status?: CardStatus }) {
  const open = card.state === "open" && Boolean(onAction && card.resumeRunId);
  const pending = status && "pending" in status;
  return (
    <CardSurface>
      <header className="px-4 pt-3 pb-1">
        {open && (
          <p className="mb-1 flex items-center gap-1.5 text-2xs font-medium text-caution-ink">
            <span className="size-1.5 rounded-full bg-caution" aria-hidden="true" />
            Choose one
          </p>
        )}
        <h3 className="text-sm font-semibold">{card.title}</h3>
        {card.detail && <p className="text-xs text-ink-soft">{card.detail}</p>}
      </header>
      {open && !pending ? (
        <ul className="py-1">
          {card.options.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => onAction!({ type: "choose", optionId: option.id })}
                className="group flex min-h-10 w-full items-center gap-2.5 px-4 py-1.5 text-left outline-none transition-colors duration-100 hover:bg-hover-fill focus-visible:bg-hover-fill"
              >
                {option.app ? <AppLogo name={option.label} slug={option.app} size={20} /> : <Icon name="user" size={16} className="text-ink-soft" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{option.label}</span>
                  {option.detail && <span className="block truncate text-xs text-ink-soft">{option.detail}</span>}
                </span>
                <Icon name="chevronRight" size={14} className="shrink-0 text-ink-soft opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        !pending && card.state === "done" && <p className="flex items-center gap-1.5 px-4 pb-3 text-sm text-ink-soft"><Icon name="check" size={14} className="text-ok-ink" /> Chosen</p>
      )}
      {status && (
        <div className="px-4 pb-3">
          <CardAnswerLine status={status} />
        </div>
      )}
    </CardSurface>
  );
}
