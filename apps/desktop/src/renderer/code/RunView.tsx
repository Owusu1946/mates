import type { Dispatch, Ref } from "react";
import { ChatComposer } from "../chat/ChatComposer.tsx";
import type { Mate } from "../data/sampleCrew.ts";
import { followUpScript, type Run } from "../data/sampleRuns.ts";
import { BranchToolbar } from "./BranchToolbar.tsx";
import { DiffPanel, type DiffStyle } from "./DiffPanel.tsx";
import { RightPanel } from "./RightPanel.tsx";
import { RunHeader } from "./RunHeader.tsx";
import { isPlaying, runStatus, type RunAction, type RunState } from "./runPlayer.logic.ts";
import { RunTimeline } from "./RunTimeline.tsx";
import { TerminalDrawer } from "./TerminalDrawer.tsx";

/** What stays the same as you move between runs: which panels are open and how diffs show. */
export type CodePanels = { diff: boolean; terminal: boolean; diffStyle: DiffStyle; wrap: boolean; focusPath: string | null };

type RunViewProps = {
  run: Run;
  repoName: string;
  state: RunState;
  mate: Mate;
  dispatch: Dispatch<RunAction>;
  panels: CodePanels;
  onPanels: (change: Partial<CodePanels>) => void;
  draft: string;
  onDraft: (text: string) => void;
  composerRef: Ref<HTMLTextAreaElement>;
  /** The coding tools: Diff panel, terminal, branch toolbar. Off, a run is the readable timeline. */
  workbench: boolean;
};

/**
 * A coding run: the timeline and composer in a column with the terminal drawer under them, and
 * the Diff panel beside (T3 Code's ChatView for a project thread). Without the coding tools it's
 * only the timeline: what the mate thought, did and changed. Keyed by run.
 */
export function RunView({ run, repoName, state, mate, dispatch, panels, onPanels, draft, onDraft, composerRef, workbench }: RunViewProps) {
  const status = runStatus(state);
  const playing = isPlaying(state);
  const hasTerminal = workbench && run.terminals.length > 0;

  const send = () => {
    dispatch({ type: "followUp", runId: run.id, text: draft, script: followUpScript(draft, state.turns), at: Date.now() });
    onDraft("");
  };

  return (
    <div data-run-row className="flex h-full min-w-0 animate-fade">
      <div data-run-column className="flex min-w-0 flex-1 flex-col">
        <RunHeader
          run={run}
          repoName={repoName}
          status={status}
          diffOpen={panels.diff}
          terminalOpen={panels.terminal && hasTerminal}
          onToggleDiff={() => onPanels({ diff: !panels.diff })}
          onToggleTerminal={() => onPanels({ terminal: !panels.terminal })}
          workbench={workbench}
        />
        <RunTimeline
          runId={run.id}
          state={state}
          mate={mate}
          onAnswer={(approvalId, allow) => dispatch({ type: "answer", runId: run.id, approvalId, allow, at: Date.now() })}
          onOpenFile={workbench ? (path) => onPanels({ diff: true, focusPath: path }) : undefined}
          composer={(
            <ChatComposer
              ref={composerRef}
              draft={draft}
              placeholder={state.waitingOn ? `${mate.name} is waiting on your answer above` : `Ask ${mate.name} for changes`}
              busy={playing}
              disabled={Boolean(state.waitingOn)}
              onDraft={onDraft}
              onSend={send}
              onStop={() => dispatch({ type: "stop", runId: run.id, at: Date.now() })}
              footer={workbench ? <BranchToolbar where={run.where} branch={run.branch} /> : undefined}
            />
          )}
        />
        {hasTerminal && <TerminalDrawer key={run.id} open={panels.terminal} terminals={run.terminals} output={state.terminalOutput} onClose={() => onPanels({ terminal: false })} />}
      </div>
      <RightPanel open={workbench && panels.diff} tabs={[{ id: "diff", label: "Diff", icon: "columns" }]} active="diff" onClose={() => onPanels({ diff: false })}>
        <DiffPanel
          patchIds={state.patchIds}
          focusPath={panels.focusPath}
          diffStyle={panels.diffStyle}
          wrap={panels.wrap}
          onDiffStyle={(diffStyle) => onPanels({ diffStyle })}
          onWrap={(wrap) => onPanels({ wrap })}
        />
      </RightPanel>
    </div>
  );
}
