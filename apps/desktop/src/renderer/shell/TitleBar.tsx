import { MatesWordmark } from "../components/MatesLogo.tsx";
import { Button } from "../components/ui/Button.tsx";
import { cn } from "../lib/utils.ts";

const platform = window.mates.platform;

/** Window drag region and sidebar controls, with room for native caption buttons. */
export function TitleBar({ sidebarOpen = true, onToggleSidebar }: { sidebarOpen?: boolean; onToggleSidebar?: () => void }) {
  if (platform === "linux" && !onToggleSidebar) return null;
  return (
    <header className={cn("flex h-(--title-bar) shrink-0 items-center gap-2 px-3", platform !== "linux" && "app-drag", platform === "darwin" && "traffic-lights-inset", platform === "win32" && "pr-[150px]")}>
      {onToggleSidebar && (
        <>
          <Button
            variant="ghost"
            size="icon-sm"
            icon={sidebarOpen ? "sidebarClose" : "sidebar"}
            className="app-no-drag"
            aria-label="Toggle main sidebar"
            aria-pressed={sidebarOpen}
            onClick={onToggleSidebar}
          />
          <MatesWordmark compact />
        </>
      )}
      {platform === "win32" && !onToggleSidebar && <span className="text-xs text-ink-soft">Mates</span>}
    </header>
  );
}
