import { Button } from "../../components/ui/Button.tsx";
import { Icon } from "../../components/ui/Icon.tsx";
import type { Card, CardStatus } from "../../data/sampleCrew.ts";
import { cn } from "../../lib/utils.ts";
import type { CardAction } from "./cardAnswers.logic.ts";
import { CardAnswerLine } from "./CardParts.tsx";

type ApprovalCardProps = {
  card: Extract<Card, { type: "approval" }>;
  /** A sample card (no run behind it) answers on this device. */
  onAnswer: (state: "allowed" | "skipped") => void;
  /** A real one answers its run, which carries on (remote/cardActions.ts). */
  onAction?: (action: CardAction) => void;
  status?: CardStatus;
};

/**
 * Something a mate won't do without your OK: sending, sharing, deleting or spending. It shows what
 * will go and to whom; Allow, Always allow (when the API offers it, never for money) or Not now
 * carry the reply on, and once answered it says what you chose (action-approval.tsx on the phone).
 */
export function ApprovalCard({ card, onAnswer, onAction, status }: ApprovalCardProps) {
  const open = card.state === "open";
  const pending = status && "pending" in status;
  const real = Boolean(onAction && card.resumeRunId);
  const answer = (action: CardAction) => (real ? onAction!(action) : onAnswer(action.type === "decline" ? "skipped" : "allowed"));
  return (
    <section className={cn("rounded-xl border bg-raised p-4 transition-colors duration-150", open ? "border-caution/40" : "border-line")}>
      {open && (
        <div className="mb-2 flex items-center gap-2 text-2xs font-medium text-caution-ink">
          <span className="size-1.5 rounded-full bg-caution" aria-hidden="true" />
          Needs your OK
        </div>
      )}
      <h3 className="text-[15px] font-semibold">{card.title}</h3>
      {card.detail && <p className="mt-1 select-text text-ink-soft">{card.detail}</p>}
      {card.fields && card.fields.length > 0 && (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {card.fields.map((field) => (
            <div key={field.label} className="contents">
              <dt className="text-ink-soft">{field.label}</dt>
              <dd className="min-w-0 select-text wrap-anywhere">{field.text}</dd>
            </div>
          ))}
        </dl>
      )}
      {card.meta && <p className="mt-2 text-xs text-ink-soft">{card.meta}</p>}
      <div className="mt-4 flex flex-col gap-2">
        {open ? (
          <>
            {!pending && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <Button onClick={() => answer({ type: "approve" })}>{card.allow}</Button>
                {card.canAlways && (
                  <Button variant="outline" onClick={() => answer({ type: "always" })}>
                    Always allow
                  </Button>
                )}
                <Button variant="ghost" onClick={() => answer({ type: "decline" })}>
                  Not now
                </Button>
              </div>
            )}
            <CardAnswerLine status={status} />
          </>
        ) : (
          <span className="flex animate-fade items-center gap-1.5 text-sm text-ink-soft">
            {card.state === "allowed" ? (
              <>
                <Icon name="check" size={16} className="text-ok-ink" /> Allowed
              </>
            ) : (
              "Not this time"
            )}
          </span>
        )}
      </div>
    </section>
  );
}
