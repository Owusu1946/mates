import { Icon } from "../components/ui/Icon.tsx";
import { Kbd, MOD } from "../components/ui/Kbd.tsx";
import { Tooltip } from "../components/ui/Tooltip.tsx";
import { cn } from "../lib/utils.ts";

const platform = window.mates.platform;

/**
 * The top strip. On Windows and macOS we draw the title bar, so it drags the window and leaves room
 * for the system's buttons (caption buttons on the right, traffic lights on the left). Linux keeps
 * its own frame, so there the strip is only a toolbar, and during onboarding it isn't there at all.
 * Signed in, it carries the button for the command palette and this computer's status.
 */
export function TitleBar({ onSearch }: { onSearch?: () => void }) {
  const search = Boolean(onSearch);
  if (platform === "linux" && !search) return null;
  const drag = platform !== "linux";
  return (
    <header className={cn("flex h-(--title-bar) shrink-0", drag && "app-drag")}>
      {search && <div className={cn("w-(--sidebar-width) shrink-0 border-r border-line bg-rail", platform === "darwin" && "pl-20")} />}
      <div className={cn("flex min-w-0 flex-1 items-center gap-3 px-3", platform === "win32" && "pr-[150px]", platform === "darwin" && !search && "pl-20")}>
        {platform === "win32" && !search && <span className="text-xs text-ink-soft">Mates</span>}
        {search && (
          <>
            <div className="flex-1" />
            <button
              type="button"
              onClick={onSearch}
              className="app-no-drag flex h-7 w-full max-w-md items-center gap-2 rounded-control border border-line bg-soft px-2.5 text-xs text-ink-soft outline-none transition-colors hover:border-field-line hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Icon name="search" size={14} />
              <span className="flex-1 truncate text-left">Search or jump to…</span>
              <Kbd>
                {MOD} K
              </Kbd>
            </button>
            <div className="flex flex-1 justify-end">
              <Tooltip side="bottom" content="This computer is ready for your mates">
                <button type="button" aria-label="This computer: ready" className="app-no-drag relative flex size-7 items-center justify-center rounded-control text-ink-soft outline-none hover:bg-hover-fill hover:text-ink focus-visible:ring-2 focus-visible:ring-brand">
                  <Icon name="monitor" size={16} />
                  <span className="absolute top-1 right-1 size-1.5 rounded-full bg-ok ring-2 ring-canvas" />
                </button>
              </Tooltip>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
