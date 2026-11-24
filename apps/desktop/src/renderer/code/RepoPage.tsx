import { useState, type Ref } from "react";
import { ChatComposer } from "../chat/ChatComposer.tsx";
import { Icon } from "../components/ui/Icon.tsx";
import type { Repo } from "../data/sampleCrew.ts";
import type { Run } from "../data/sampleRuns.ts";
import { BranchToolbar } from "./BranchToolbar.tsx";
import { RunStatusDot } from "./RunStatusDot.tsx";
import type { RunStatus } from "./runPlayer.logic.ts";

type RepoPageProps = {
  repo: Repo;
  runs: { run: Run; status: RunStatus }[];
  mateName: string;
  draft: string;
  onDraft: (text: string) => void;
  onStart: (where: Run["where"]) => void;
  onOpenRun: (runId: string) => void;
  composerRef: Ref<HTMLTextAreaElement>;
};

/** A repo's home: ask the mate for something, and its runs so far. */
export function RepoPage({ repo, runs, mateName, draft, onDraft, onStart, onOpenRun, composerRef }: RepoPageProps) {
  const [where, setWhere] = useState(repo.where);
  return (
    <div className="flex h-full animate-fade flex-col">
      <header className="flex h-13 shrink-0 items-center gap-2.5 border-b border-line px-6">
        <Icon name="branch" size={18} className="text-ink-soft" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{repo.name}</h2>
          <p className="flex items-center gap-1.5 text-2xs text-ink-soft">
            <Icon name={repo.where === "cloud" ? "cloud" : "monitor"} size={12} />
            {repo.where === "cloud" ? "Cloud" : "This PC"}
            <span aria-hidden="true">·</span>
            <span className="font-mono">main</span>
          </p>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-(--chat-max-width) flex-col gap-4 py-10">
          <div className="flex flex-col gap-4">
            <h1 className="px-6 text-xl font-semibold">What should {mateName} do in {repo.name}?</h1>
            <ChatComposer
              ref={composerRef}
              draft={draft}
              placeholder="Fix a bug, add a feature, ask about the code…"
              busy={false}
              onDraft={onDraft}
              onSend={() => onStart(where)}
              onStop={() => {}}
              footer={<BranchToolbar where={where} branch="new branch from main" onWhereChange={setWhere} />}
            />
          </div>
          {runs.length > 0 && (
            <section className="flex flex-col gap-1 px-6">
              <h2 className="px-2 pb-1 text-2xs font-medium text-ink-soft">Runs</h2>
              {runs.map(({ run, status }) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => onOpenRun(run.id)}
                  className="flex h-11 items-center gap-3 rounded-lg px-2 text-left outline-none transition-colors hover:bg-hover-fill focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
                >
                  <RunStatusDot status={status} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{run.title}</span>
                    <span className="block truncate font-mono text-2xs text-ink-soft">{run.branch}</span>
                  </span>
                  {run.pr ? <span className="text-xs text-ink-soft">#{run.pr}</span> : <span className="text-xs text-ink-soft capitalize">{status === "waiting" ? "Needs you" : status}</span>}
                </button>
              ))}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
