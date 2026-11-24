import { Icon } from "../components/ui/Icon.tsx";
import { Menu, MenuRadioGroup, MenuRadioItem } from "../components/ui/Menu.tsx";
import type { Run } from "../data/sampleRuns.ts";

type Where = Run["where"];

type BranchToolbarProps = {
  where: Where;
  branch: string;
  /** Present when the place can still be chosen (a new run); a run in progress keeps its own. */
  onWhereChange?: (where: Where) => void;
};

const chip = "flex h-6 items-center gap-1.5 rounded-md px-1.5 text-xs text-ink-soft [&_svg]:size-3.5";

/** Under the composer: where the mate works and on which branch (T3 Code's BranchToolbar). */
export function BranchToolbar({ where, branch, onWhereChange }: BranchToolbarProps) {
  const place = (
    <>
      <Icon name={where === "cloud" ? "cloud" : "monitor"} />
      {where === "cloud" ? "Cloud" : "This PC"}
    </>
  );
  return (
    <div className="flex min-w-0 items-center gap-1">
      {onWhereChange ? (
        <Menu
          side="top"
          trigger={
            <button type="button" className={`${chip} outline-none hover:bg-hover-fill hover:text-ink focus-visible:ring-2 focus-visible:ring-brand data-popup-open:bg-hover-fill`}>
              {place}
              <Icon name="chevronDown" />
            </button>
          }
        >
          <MenuRadioGroup<Where> value={where} onChange={onWhereChange}>
            <MenuRadioItem value="this PC" icon="monitor">
              This PC
            </MenuRadioItem>
            <MenuRadioItem value="cloud" icon="cloud">
              Cloud
            </MenuRadioItem>
          </MenuRadioGroup>
        </Menu>
      ) : (
        <span className={chip}>{place}</span>
      )}
      <span className={`${chip} min-w-0`}>
        <Icon name="branch" />
        <span className="truncate font-mono">{branch}</span>
      </span>
    </div>
  );
}
