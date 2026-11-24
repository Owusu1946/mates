import { PatchDiff } from "@pierre/diffs/react";
import { useLayoutEffect, useRef } from "react";
import { Button } from "../components/ui/Button.tsx";
import { PATCHES } from "../data/sampleRuns.ts";
import { useAppearance } from "../theme/appearance.ts";
import { DiffStat } from "./DiffStat.tsx";
import { patchStat, totalStat } from "./diffStat.logic.ts";
import { DiffWorkerPool } from "./DiffWorkerPool.tsx";

export type DiffStyle = "split" | "unified";

/**
 * Pierre draws inside a shadow root, which our CSS custom properties still reach: the diff sits
 * on our canvas, in our fonts, with sticky 32px file headers (T3 Code's StyledDiffCodeView).
 */
const SURFACE_CSS = `
[data-diffs-header], [data-diff], [data-file] {
  --diffs-header-font-family: var(--font-sans) !important;
  --diffs-font-family: var(--font-mono) !important;
  --diffs-bg: var(--canvas) !important;
  --diffs-light-bg: var(--canvas) !important;
  --diffs-dark-bg: var(--canvas) !important;
}
[data-diffs-header] {
  position: sticky !important;
  top: 0;
  z-index: 4;
  height: 32px !important;
  min-height: 32px !important;
  padding-block: 0 !important;
  padding-inline: 12px !important;
  font-size: 12px !important;
  background-color: var(--canvas) !important;
  border-bottom: 1px solid var(--line) !important;
}
`;

type DiffPanelProps = {
  patchIds: string[];
  /** A file to bring into view, e.g. one clicked in the changed-files card. */
  focusPath: string | null;
  diffStyle: DiffStyle;
  wrap: boolean;
  onDiffStyle: (style: DiffStyle) => void;
  onWrap: (wrap: boolean) => void;
};

/** Every file the run changed, highlighted, split or unified (T3 Code's DiffPanel). */
export function DiffPanel({ patchIds, focusPath, diffStyle, wrap, onDiffStyle, onWrap }: DiffPanelProps) {
  const { dark } = useAppearance();
  const scroller = useRef<HTMLDivElement>(null);
  const files = patchIds.flatMap((id) => (PATCHES[id] ? [{ id, ...PATCHES[id], stat: patchStat(PATCHES[id].path, PATCHES[id].patch) }] : []));
  const total = totalStat(files.map((file) => file.stat));

  useLayoutEffect(() => {
    if (!focusPath) return;
    scroller.current?.querySelector(`[data-path="${CSS.escape(focusPath)}"]`)?.scrollIntoView({ block: "start" });
  }, [focusPath]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3">
        <span className="text-xs font-medium">{files.length === 1 ? "1 file" : `${files.length} files`}</span>
        <DiffStat additions={total.additions} deletions={total.deletions} />
        <div className="flex-1" />
        <Button
          variant="ghost-muted"
          size="icon-xs"
          icon={diffStyle === "split" ? "rows" : "columns"}
          aria-label={diffStyle === "split" ? "Show in one column" : "Show side by side"}
          onClick={() => onDiffStyle(diffStyle === "split" ? "unified" : "split")}
        />
        <Button variant={wrap ? "secondary" : "ghost-muted"} size="icon-xs" icon="wrap" aria-label="Wrap long lines" aria-pressed={wrap} onClick={() => onWrap(!wrap)} />
      </div>
      {files.length === 0 ? (
        <p className="m-auto max-w-56 text-center text-ink-soft">No changes yet. They show here as the mate makes them.</p>
      ) : (
        <div ref={scroller} className="min-h-0 flex-1 overflow-auto select-text">
          <DiffWorkerPool>
            {files.map((file) => (
              <section key={file.id} data-path={file.path} className="border-b border-line">
                <PatchDiff patch={file.patch} options={{ diffStyle, overflow: wrap ? "wrap" : "scroll", themeType: dark ? "dark" : "light", unsafeCSS: SURFACE_CSS }} />
              </section>
            ))}
          </DiffWorkerPool>
        </div>
      )}
    </div>
  );
}
