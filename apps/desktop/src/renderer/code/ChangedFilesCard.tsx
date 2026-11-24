import { memo, useState } from "react";
import { Button } from "../components/ui/Button.tsx";
import { Icon } from "../components/ui/Icon.tsx";
import { PATCHES } from "../data/sampleRuns.ts";
import { DiffStat } from "./DiffStat.tsx";
import { fileTree, patchStat, totalStat, type TreeNode } from "./diffStat.logic.ts";

type ChangedFilesCardProps = {
  patchIds: string[];
  onOpenFile: (path: string) => void;
};

const rowClass =
  "group flex h-7 w-full items-center gap-2 rounded-md pe-2 text-left outline-none transition-colors hover:bg-hover-fill focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand";

/** What a turn changed, as a folder tree with counts (T3 Code's ChangedFilesTree). A file opens in the Diff panel. */
export const ChangedFilesCard = memo(function ChangedFilesCard({ patchIds, onOpenFile }: ChangedFilesCardProps) {
  const [closed, setClosed] = useState<string[]>([]);
  const files = patchIds.flatMap((id) => (PATCHES[id] ? [patchStat(PATCHES[id].path, PATCHES[id].patch)] : []));
  const total = totalStat(files);

  const renderNode = (node: TreeNode, depth: number) => {
    const indent = { paddingInlineStart: `${0.5 + depth * 0.875}rem` };
    if (node.kind === "file")
      return (
        <button key={node.path} type="button" className={rowClass} style={indent} onClick={() => onOpenFile(node.path)}>
          <Icon name="file" size={14} className="shrink-0 text-ink-soft opacity-75" />
          <span className="min-w-0 flex-1 truncate font-mono text-2xs text-ink/90">{node.name}</span>
          <DiffStat additions={node.additions} deletions={node.deletions} />
        </button>
      );
    const open = !closed.includes(node.path);
    return (
      <div key={node.path}>
        <button type="button" aria-expanded={open} className={rowClass} style={indent} onClick={() => setClosed(open ? [...closed, node.path] : closed.filter((path) => path !== node.path))}>
          <Icon name="folder" size={14} className="shrink-0 text-ink-soft opacity-75" />
          <span className="min-w-0 flex-1 truncate font-mono text-2xs text-ink-soft group-hover:text-ink/90">{node.name}</span>
          {!open && <DiffStat additions={node.additions} deletions={node.deletions} />}
        </button>
        {open && node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <section className="rounded-lg bg-soft">
      <header className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex items-center gap-3 text-xs font-medium">
          {files.length === 1 ? "1 file changed" : `${files.length} files changed`}
          <DiffStat additions={total.additions} deletions={total.deletions} />
        </div>
        <Button variant="outline" size="xs" icon="columns" onClick={() => onOpenFile(files[0]?.path ?? "")}>
          View diff
        </Button>
      </header>
      <div className="px-1 pb-1.5">{fileTree(files).map((node) => renderNode(node, 0))}</div>
    </section>
  );
});
