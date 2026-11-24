import { Button } from "../../components/ui/Button.tsx";
import { Icon } from "../../components/ui/Icon.tsx";
import type { Card } from "../../data/sampleCrew.ts";
import { cn } from "../../lib/utils.ts";

type ApprovalCardProps = {
  card: Extract<Card, { type: "approval" }>;
  onAnswer: (state: "allowed" | "skipped") => void;
};

/** Something a mate won't do without your OK, like a payment. Once answered, it says what you chose. */
export function ApprovalCard({ card, onAnswer }: ApprovalCardProps) {
  const open = card.state === "open";
  return (
    <section className={cn("rounded-xl border bg-raised p-4", open ? "border-caution/40" : "border-line")}>
      {open && (
        <div className="mb-2 flex items-center gap-2 text-2xs font-medium text-caution-ink">
          <span className="size-1.5 rounded-full bg-caution" aria-hidden="true" />
          Needs your OK
        </div>
      )}
      <h3 className="text-[15px] font-semibold">{card.title}</h3>
      <p className="mt-1 select-text text-ink-soft">{card.detail}</p>
      <p className="mt-2 text-xs text-ink-soft">{card.meta}</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {open ? (
          <>
            <Button onClick={() => onAnswer("allowed")}>{card.allow}</Button>
            <Button variant="ghost" onClick={() => onAnswer("skipped")}>
              Not now
            </Button>
          </>
        ) : (
          <span className="flex animate-fade items-center gap-1.5 text-sm text-ink-soft">
            {card.state === "allowed" ? (
              <>
                <Icon name="check" size={16} className="text-ok-ink" /> Sent to your phone
              </>
            ) : (
              "Skipped for now"
            )}
          </span>
        )}
      </div>
    </section>
  );
}
