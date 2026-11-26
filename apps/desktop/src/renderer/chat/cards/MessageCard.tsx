import { use } from "react";
import type { Card } from "../../data/sampleCrew.ts";
import { ApprovalCard } from "./ApprovalCard.tsx";
import { BriefCard } from "./BriefCard.tsx";
import { CardMatesContext } from "./CardParts.tsx";
import { MemoryLine, SourcesPill } from "./QuietCards.tsx";
import { RunCard } from "./RunCard.tsx";
import { ConnectCard, ScheduleCard, WatchCard } from "./StandingCards.tsx";
import { ComparisonCard, PlanCard, ResultsCard } from "./WorkCards.tsx";
import { WorkActivity } from "../WorkActivity.tsx";

type MessageCardProps = {
  card: Card;
  /** Who posted it, for "Kofi is carrying on" and "Kofi's take". */
  authorId: string;
  onAnswer: (state: "allowed" | "skipped") => void;
  /** A card that changes (a plan running, a routine paused) saves its new state here. */
  onChange: (card: Card) => void;
};

/** The card a message carries, whichever kind it is. */
export function MessageCard({ card, authorId, onAnswer, onChange }: MessageCardProps) {
  const mates = use(CardMatesContext);
  switch (card.type) {
    case "activity":
      return <WorkActivity card={card} />;
    case "brief":
      return <BriefCard card={card} />;
    case "approval":
      return <ApprovalCard card={card} onAnswer={onAnswer} />;
    case "run":
      return <RunCard card={card} />;
    case "sources":
      return <SourcesPill card={card} />;
    case "memory":
      return <MemoryLine card={card} onChange={onChange} />;
    case "results":
      return <ResultsCard card={card} />;
    case "plan":
      return <PlanCard card={card} onChange={onChange} />;
    case "comparison":
      return <ComparisonCard card={card} />;
    case "schedule":
      return <ScheduleCard card={card} onChange={onChange} />;
    case "watch":
      return <WatchCard card={card} onChange={onChange} />;
    case "connect":
      return <ConnectCard card={card} mateName={mates[authorId]?.name ?? "Your mate"} onChange={onChange} />;
  }
}
