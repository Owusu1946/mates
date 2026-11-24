import { MessageRow } from "../chat/MessageRow.tsx";
import { useTimelineScroll } from "../chat/useTimelineScroll.ts";
import type { Mate } from "../data/sampleCrew.ts";
import type { RunItem } from "../data/sampleRuns.ts";
import { ChangedFilesCard } from "./ChangedFilesCard.tsx";
import type { RunState } from "./runPlayer.logic.ts";
import { ToolApprovalRow } from "./ToolApprovalRow.tsx";
import { LiveWorkGroup, WorkGroup } from "./WorkGroup.tsx";

type RunTimelineProps = {
  runId: string;
  state: RunState;
  mate: Mate;
  onAnswer: (approvalId: string, allow: boolean) => void;
  onOpenFile: (path: string) => void;
};

/** Settled turns skip layout and paint while off screen; the live end never does. */
const settled = "[content-visibility:auto] [contain-intrinsic-size:auto_3rem]";

/**
 * A run, top to bottom (T3 Code's MessagesTimeline for a coding thread): your requests, the
 * mate's work folded into groups, approvals, its answers and what changed, then the turn in progress.
 */
export function RunTimeline({ runId, state, mate, onAnswer, onOpenFile }: RunTimelineProps) {
  const { items, live } = state;
  const lastItem = items.at(-1);
  const content = `${items.length}:${live?.steps.length ?? -1}:${live?.current?.id ?? ""}`;
  const { scroller, onScroll } = useTimelineScroll(runId, content, lastItem?.type === "message" && lastItem.author === "me");

  const renderItem = (item: RunItem) => {
    switch (item.type) {
      case "message":
        return <MessageRow message={{ id: item.id, author: item.author === "me" ? "me" : mate.id, text: item.text }} mate={mate} showAuthor={false} onAnswer={() => {}} />;
      case "work":
        return (
          <div className={settled}>
            <WorkGroup steps={item.steps} durationMs={item.durationMs} />
          </div>
        );
      case "approval":
        return <ToolApprovalRow approval={item} mateName={mate.name} onAnswer={(allow) => onAnswer(item.id, allow)} />;
      case "changes":
        return (
          <div className={settled}>
            <ChangedFilesCard patchIds={item.patchIds} onOpenFile={onOpenFile} />
          </div>
        );
    }
  };

  return (
    <div ref={scroller} tabIndex={-1} data-focus-area="timeline" className="min-h-0 flex-1 overflow-y-auto outline-none" onScroll={onScroll}>
      <div className="mx-auto flex max-w-(--chat-max-width) flex-col gap-4 px-6 pt-6 pb-8">
        {items.map((item) => (
          <div key={item.id}>{renderItem(item)}</div>
        ))}
        {live && <LiveWorkGroup key={live.id} group={live} />}
      </div>
    </div>
  );
}
