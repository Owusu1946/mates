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
};

const STATUS_TEXT: Record<RunStatus, string> = { working: "Working", waiting: "Needs you", done: "Done", ready: "Ready" };

/** The run's title, where it runs, and the Diff and Terminal switches. */
export function RunHeader({ run, repoName, status, diffOpen, terminalOpen, onToggleDiff, onToggleTerminal }: RunHeaderProps) {
  return (
    <header className="flex h-13 shrink-0 items-center gap-3 border-b border-line px-4">
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold">{run.title}</h2>
        <p className="-ms-1 flex min-w-0 items-center gap-1 text-2xs text-ink-soft">
          <RunStatusDot status={status} />
          {STATUS_TEXT[status]}
          <span aria-hidden="true">·</span>
          <span className="truncate font-mono">
            {repoName} · {run.branch}
          </span>
          <span aria-hidden="true">·</span>
          <Icon name={run.where === "cloud" ? "cloud" : "monitor"} size={12} />
          {run.where === "cloud" ? "Cloud" : "This PC"}
        </p>
      </div>
      {run.pr && (
        <Button variant="outline" size="xs" icon="pr">
          #{run.pr}
        </Button>
      )}
      {run.terminals.length > 0 && (
        <Tooltip side="bottom" content={`Terminal  ${MOD} J`}>
          <Button variant={terminalOpen ? "secondary" : "ghost-muted"} size="icon-sm" icon="terminal" aria-label="Terminal" aria-pressed={terminalOpen} onClick={onToggleTerminal} />
        </Tooltip>
      )}
      <Tooltip side="bottom" content={`Diff  ${MOD} D`}>
        <Button variant={diffOpen ? "secondary" : "ghost-muted"} size="icon-sm" icon="columns" aria-label="Diff" aria-pressed={diffOpen} onClick={onToggleDiff} />
      </Tooltip>
    </header>
  );
}
