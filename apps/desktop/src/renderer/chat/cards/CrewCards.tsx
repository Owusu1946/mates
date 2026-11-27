import { useQueryClient } from "@tanstack/react-query";
import { use } from "react";
import { Button } from "../../components/ui/Button.tsx";
import { Mascot } from "../../components/ui/Mascot.tsx";
import type { Card, CardMate, HandoffStatus } from "../../data/sampleCrew.ts";
import { cn } from "../../lib/utils.ts";
import { OpenChatContext } from "../openChat.ts";
import { CardSurface } from "./CardParts.tsx";
import type { PolygonState, ShapeName } from "@muse-clone/mascot";

/**
 * Mates working with mates, as on the phone (mates/relay.tsx, mates/mission.tsx, consult-card.tsx):
 * who a lead handed work to and how each is doing, a mate the lead just made, a mate another
 * checked with. Faces move only while that mate is working; everything else holds still, so a
 * long chat full of these costs nothing (and Mascot sleeps off screen anyway).
 */

const STATUS: Record<HandoffStatus, string> = { queued: "Up next", working: "Working", review: "In review", changes: "Revising", done: "Done", waiting: "Needs you", failed: "Didn’t finish" };
const FACE: Partial<Record<HandoffStatus, PolygonState>> = { working: "working", review: "thinking", changes: "working", done: "happy", waiting: "curious", failed: "confused" };

function Face({ mate, size, state = "idle" }: { mate: CardMate; size: number; state?: PolygonState }) {
  const moving = state === "working" || state === "thinking";
  return <Mascot size={size} gradient={mate.gradient} shape={mate.shape as ShapeName | undefined} state={state} still={!moving} />;
}

/** "Kofi handed off": each mate's task, live status and current step. */
export function HandoffCard({ card }: { card: Extract<Card, { type: "handoff" }> }) {
  const head = `${card.round ? `Round ${card.round} · ` : ""}${card.asked ? "You asked" : `${card.from.name} handed off`}`;
  return (
    <CardSurface>
      <p className="px-4 pt-3 text-2xs font-semibold tracking-wide text-ink-soft uppercase">{head}</p>
      <ul className="flex flex-col py-1.5">
        {card.items.map((item, index) => (
          <li key={`${item.mate.id}-${index}`} className="flex items-start gap-3 px-4 py-2">
            <Face mate={item.mate} size={26} state={FACE[item.status]} />
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline gap-2 text-sm">
                <span className="font-medium">{item.mate.name}</span>
                <span className={cn("text-xs", item.status === "done" ? "text-ok-ink" : item.status === "waiting" ? "text-caution-ink" : item.status === "failed" ? "text-danger-ink" : "text-ink-soft")}>{STATUS[item.status]}</span>
              </p>
              <p className="line-clamp-2 select-text text-xs text-ink-soft">{item.task}</p>
              {item.step && item.status === "working" && <p className="mt-0.5 truncate text-xs text-ink-soft live-shine">{item.step}</p>}
            </div>
          </li>
        ))}
      </ul>
    </CardSurface>
  );
}

/** A mate your lead just made: its face says hello, with what it does and a way into its chat. */
export function NewMateCard({ card }: { card: Extract<Card, { type: "newMate" }> }) {
  const openChat = use(OpenChatContext);
  const client = useQueryClient();
  const { mate } = card;
  const open = async () => {
    // It's new: the sidebar may not have it yet.
    await Promise.all([client.invalidateQueries({ queryKey: ["mates"] }), client.invalidateQueries({ queryKey: ["chats"] })]);
    openChat?.(mate.chatId);
  };
  return (
    <CardSurface>
      <div className="flex items-center gap-4 px-4 py-3.5">
        <span className="animate-fade">
          <Mascot size={52} gradient={mate.gradient} shape={mate.shape as ShapeName | undefined} state="excited" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-2xs font-semibold tracking-wide text-ink-soft uppercase">New mate</p>
          <p className="text-sm font-medium">
            {mate.name} <span className="font-normal text-ink-soft">· {mate.role}</span>
          </p>
          {mate.description && <p className="mt-0.5 line-clamp-2 text-xs text-ink-soft">{mate.description}</p>}
        </div>
        {openChat && (
          <Button size="xs" variant="outline" onClick={() => void open()}>
            Open chat
          </Button>
        )}
      </div>
    </CardSurface>
  );
}

/** "Checked with Esi": a mate looked at what another knows about you before answering. */
export function ConsultLine({ card }: { card: Extract<Card, { type: "consult" }> }) {
  return (
    <p className="flex min-w-0 items-center gap-2 px-0.5 text-xs text-ink-soft" title={card.question}>
      <Face mate={card.mate} size={18} />
      <span className="truncate">
        Checked with <span className="font-medium text-ink">{card.mate.name}</span>
        {card.found ? "" : " · nothing yet"}
      </span>
    </p>
  );
}
