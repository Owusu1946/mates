import { RunStatusDot } from "../code/RunStatusDot.tsx";
import type { RunStatus } from "../code/runPlayer.logic.ts";
import { Icon } from "../components/ui/Icon.tsx";
import type { Repo } from "../data/sampleCrew.ts";
import type { Run } from "../data/sampleRuns.ts";
import { SidebarRow } from "./SidebarRow.tsx";

type RepoRowProps = {
  repo: Repo;
  runs: { run: Run; status: RunStatus }[];
  isSelected: (kind: "repo" | "run", id: string) => boolean;
  onSelectRepo: () => void;
  onSelectRun: (runId: string) => void;
};

/** A repo and, under it, its runs (T3 Code's project with its threads). */
export function RepoRow({ repo, runs, isSelected, onSelectRepo, onSelectRun }: RepoRowProps) {
  return (
    <div className="flex flex-col gap-px">
      <SidebarRow leading={<Icon name="branch" />} label={repo.name} meta={repo.where} selected={isSelected("repo", repo.id)} onClick={onSelectRepo} />
      {runs.map(({ run, status }) => (
        <SidebarRow
          key={run.id}
          nested
          leading={<RunStatusDot status={status} />}
          label={run.title}
          meta={run.pr ? `#${run.pr}` : status === "waiting" ? "needs you" : undefined}
          selected={isSelected("run", run.id)}
          onClick={() => onSelectRun(run.id)}
        />
      ))}
    </div>
  );
}
