import { use } from "react";
import { Button } from "../../components/ui/Button.tsx";
import { Icon } from "../../components/ui/Icon.tsx";
import type { Card } from "../../data/sampleCrew.ts";
import { OpenRunContext } from "../openRun.ts";

/**
 * Code a mate did for you, shown like any other job it finished: the project, what changed, and
 * the PR. See the work opens the run; the code itself stays one step away.
 */
export function RunCard({ card }: { card: Extract<Card, { type: "run" }> }) {
  const openRun = use(OpenRunContext);
  return (
    <section className="flex items-center gap-3 rounded-xl border border-line bg-raised px-4 py-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-soft text-ink-soft">
        <Icon name="branch" size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{card.title}</p>
        <p className="truncate text-xs text-ink-soft">
          {card.project} · {card.files === 1 ? "1 file changed" : `${card.files} files changed`}
          {card.pr ? ` · PR #${card.pr}` : ""}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={() => openRun(card.runId)}>
        See the work
      </Button>
    </section>
  );
}
