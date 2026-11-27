import { Button } from "../components/ui/Button.tsx";
import { Icon } from "../components/ui/Icon.tsx";
import { MOD } from "../components/ui/Kbd.tsx";
import { Tooltip } from "../components/ui/Tooltip.tsx";
import type { Run } from "../data/sampleRuns.ts";
import type { RunStatus } from "./runPlayer.logic.ts";
import { RunStatusDot } from "./RunStatusDot.tsx";

type RunHeaderProps = {
  run: Run;
  repoName: string;
  status: RunStatus;
  diffOpen: boolean;
  terminalOpen: boolean;
  onToggleDiff: () => void;
  onToggleTerminal: () => void;
  /** The Diff and Terminal switches, only when the coding tools are on. */
  workbench: boolean;
};

const STATUS_TEXT: Record<RunStatus, string> = { working: "Working", waiting: "Needs you", done: "Done", ready: "Ready" };

/** The run's title, where it runs, and the Diff and Terminal switches. */
export function RunHeader({ run, repoName, status, diffOpen, terminalOpen, onToggleDiff, onToggleTerminal, workbench }: RunHeaderProps) {
  return (
    <header className="workspace-page-header flex h-13 shrink-0 items-center gap-4 border-b border-line px-6">
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold">{run.title}</h2>
        <p className="flex min-w-0 items-center gap-1.5 text-2xs text-ink-soft">
          <span className="flex shrink-0 items-center gap-0.5">
            <span aria-hidden="true"><RunStatusDot status={status} /></span>
            {STATUS_TEXT[status]}
          </span>
          <span aria-hidden="true">·</span>
          <span className="truncate font-mono">
            {repoName} · {run.branch}
          </span>
          <span aria-hidden="true">·</span>
          <span className="flex shrink-0 items-center gap-1">
            <Icon name={run.where === "cloud" ? "cloud" : "monitor"} size={12} />
            {run.where === "cloud" ? "Cloud" : "This PC"}
          </span>
        </p>
      </div>
      {run.pr && (
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-ink-soft">
          <Icon name="pr" size={14} />
          #{run.pr}
        </span>
      )}
      {workbench && <div className="flex shrink-0 items-center gap-1">
        {run.terminals.length > 0 && (
          <Tooltip side="bottom" content={`Terminal  ${MOD} J`}>
            <Button variant={terminalOpen ? "secondary" : "ghost-muted"} size="icon-sm" icon="terminal" aria-label="Terminal" aria-pressed={terminalOpen} onClick={onToggleTerminal} />
          </Tooltip>
        )}
        <Tooltip side="bottom" content={`Diff  ${MOD} D`}>
          <Button variant={diffOpen ? "secondary" : "ghost-muted"} size="icon-sm" icon="columns" aria-label="Diff" aria-pressed={diffOpen} onClick={onToggleDiff} />
        </Tooltip>
      </div>}
    </header>
  );
}
