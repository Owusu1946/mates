import { useEffect } from "react";
import { AppLogo } from "../../components/AppLogo.tsx";
import { Button } from "../../components/ui/Button.tsx";
import { Icon } from "../../components/ui/Icon.tsx";
import type { Card } from "../../data/sampleCrew.ts";
import { cn } from "../../lib/utils.ts";
import { CardGlyph, CardSurface, QuietAction } from "./CardParts.tsx";
import { watchCadence } from "./cards.logic.ts";

/** How long the sample "browser" takes to connect an app. */
const SAMPLE_CONNECT_MS = 1600;

/**
 * Things a mate keeps doing after the chat moves on (a routine, a watch) and the one thing it
 * needs from you to carry on (an app). Compact, with the controls in quiet words.
 */

export function ScheduleCard({ card, onChange }: { card: Extract<Card, { type: "schedule" }>; onChange: (card: Card) => void }) {
  const cancelled = card.status === "cancelled";
  return (
    <CardSurface className={cn(cancelled && "opacity-70")}>
      <div className="flex items-center gap-3 px-4 py-3">
        <CardGlyph>
          <Icon name="clock" />
        </CardGlyph>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{card.title}</p>
          <p className="truncate text-xs text-ink-soft">
            {card.when}
            {card.status === "active" && ` · Next ${card.next}`}
            {card.status === "paused" && " · Paused"}
            {cancelled && " · Cancelled"}
          </p>
        </div>
        {!cancelled && (
          <div className="flex shrink-0 items-center">
            <QuietAction onClick={() => onChange({ ...card, status: card.status === "paused" ? "active" : "paused" })}>{card.status === "paused" ? "Resume" : "Pause"}</QuietAction>
            <QuietAction tone="danger" onClick={() => onChange({ ...card, status: "cancelled" })}>
              Cancel
            </QuietAction>
          </div>
        )}
      </div>
    </CardSurface>
  );
}

const WATCH_STATUS: Record<Extract<Card, { type: "watch" }>["status"], { label: string; dot: string; text: string }> = {
  active: { label: "Watching", dot: "bg-ok status-pulse", text: "text-ok-ink" },
  paused: { label: "Paused", dot: "bg-ink-soft/50", text: "text-ink-soft" },
  fired: { label: "It happened", dot: "bg-brand", text: "text-ink" },
  cancelled: { label: "Stopped", dot: "bg-ink-soft/40", text: "text-ink-soft" },
  expired: { label: "Ended", dot: "bg-ink-soft/40", text: "text-ink-soft" },
  failed: { label: "Couldn't check", dot: "bg-danger", text: "text-danger-ink" },
};

export function WatchCard({ card, onChange }: { card: Extract<Card, { type: "watch" }>; onChange: (card: Card) => void }) {
  const status = WATCH_STATUS[card.status];
  const live = card.status === "active" || card.status === "paused";
  return (
    <CardSurface className={cn(card.status === "cancelled" && "opacity-70")}>
      <div className="px-4 pt-3 pb-2.5">
        <p className={cn("mb-1 flex items-center gap-1.5 text-2xs font-medium", status.text)}>
          <span className={cn("size-1.5 rounded-full", status.dot)} />
          {status.label}
        </p>
        <h3 className="text-sm font-semibold">{card.title}</h3>
        <dl className="mt-2 grid grid-cols-[3rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">
          <dt className="text-ink-soft">When</dt>
          <dd className="select-text">{card.condition}</dd>
          <dt className="text-ink-soft">Then</dt>
          <dd className="select-text">{card.action}</dd>
          <dt className="text-ink-soft">How</dt>
          <dd>{watchCadence(card)}</dd>
        </dl>
      </div>
      {(card.lastNote || live) && (
        <footer className="flex items-center gap-2 border-t border-line px-4 py-2">
          <p className="min-w-0 flex-1 truncate text-xs text-ink-soft">
            {card.lastNote ? (
              <>
                {card.lastChecked && <span className="tabular-nums">{card.lastChecked}: </span>}
                {card.lastNote}
              </>
            ) : (
              "No check yet"
            )}
          </p>
          {live && (
            <div className="-me-1.5 flex shrink-0">
              <QuietAction onClick={() => onChange({ ...card, status: card.status === "paused" ? "active" : "paused" })}>{card.status === "paused" ? "Resume" : "Pause"}</QuietAction>
              <QuietAction tone="danger" onClick={() => onChange({ ...card, status: "cancelled" })}>
                Stop
              </QuietAction>
            </div>
          )}
        </footer>
      )}
    </CardSurface>
  );
}

/** An app a mate needs: connect it in your browser, and the mate carries on. */
export function ConnectCard({ card, mateName, onChange }: { card: Extract<Card, { type: "connect" }>; mateName: string; onChange: (card: Card) => void }) {
  useEffect(() => {
    if (card.state !== "connecting") return;
    const timer = setTimeout(() => onChange({ ...card, state: "connected" }), SAMPLE_CONNECT_MS);
    return () => clearTimeout(timer);
  }, [card, onChange]);

  return (
    <CardSurface>
      <div className="flex items-center gap-3 px-4 py-3">
        <AppLogo name={card.app.name} slug={card.app.slug} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{card.state === "connected" ? `${card.app.name} is connected` : `Connect ${card.app.name}`}</p>
          <p className="flex items-center gap-1.5 truncate text-xs text-ink-soft">
            {card.state === "connecting" && <span className="size-3 shrink-0 animate-spin rounded-full border-[1.5px] border-current border-r-transparent" />}
            {card.state === "needed" ? card.reason : card.state === "connecting" ? "Finish in your browser" : `${mateName} is carrying on.`}
          </p>
        </div>
        {card.state === "needed" && (
          <Button size="sm" variant="outline" onClick={() => onChange({ ...card, state: "connecting" })}>
            Connect
          </Button>
        )}
        {card.state === "connecting" && (
          <Button size="sm" variant="ghost" onClick={() => onChange({ ...card, state: "needed" })}>
            Cancel
          </Button>
        )}
        {card.state === "connected" && <Icon name="check" size={16} className="shrink-0 animate-fade text-ok-ink" />}
      </div>
    </CardSurface>
  );
}
