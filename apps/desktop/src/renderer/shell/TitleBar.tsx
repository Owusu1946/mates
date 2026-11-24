import { MatesWordmark } from "../components/MatesLogo.tsx";
import { Icon } from "../components/ui/Icon.tsx";
import { Kbd, MOD } from "../components/ui/Kbd.tsx";
import { cn } from "../lib/utils.ts";

const platform = window.mates.platform;

/**
 * The top strip. On Windows and macOS we draw the title bar, so it drags the window and leaves room
 * for the system's buttons (caption buttons on the right, traffic lights on the left). Linux keeps
 * its own frame, so there the strip is only a toolbar, and during onboarding it isn't there at all.
 * Signed in, it carries our mark and name above the sidebar, and the button for the command palette.
 */
export function TitleBar({ onSearch }: { onSearch?: () => void }) {
  const search = Boolean(onSearch);
  if (platform === "linux" && !search) return null;
  const drag = platform !== "linux";
  return (
    <header className={cn("flex h-(--title-bar) shrink-0", drag && "app-drag", search && "border-b border-line")}>
      {search && (
        <div className={cn("flex w-(--sidebar-width) shrink-0 items-center border-r border-line bg-rail px-4", platform === "darwin" && "pl-20")}>
          <MatesWordmark />
        </div>
      )}
      <div className={cn("flex min-w-0 flex-1 items-center px-3", search && "justify-center", platform === "win32" && "pr-[150px]", platform === "darwin" && !search && "pl-20")}>
        {platform === "win32" && !search && <span className="text-xs text-ink-soft">Mates</span>}
        {search && (
          <button
            type="button"
            onClick={onSearch}
            className="app-no-drag flex h-7 w-full max-w-md items-center gap-2 rounded-control border border-line bg-soft px-2.5 text-xs text-ink-soft outline-none transition-colors hover:border-field-line hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Icon name="search" size={14} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate text-left">Search or jump to…</span>
            <Kbd>
              {MOD} K
            </Kbd>
          </button>
        )}
      </div>
    </header>
  );
}
