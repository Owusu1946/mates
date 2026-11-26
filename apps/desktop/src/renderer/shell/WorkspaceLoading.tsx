import { Button } from "../components/ui/Button.tsx";
import { TitleBar } from "./TitleBar.tsx";

/**
 * The window before your crew is known, which only happens on the very first load on this device:
 * after that the saved copy paints at once. The sidebar's shape holds still while rows load, or a
 * message and Try again when the API can't be reached.
 */
export function WorkspaceLoading({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <>
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <nav aria-label="Crew" aria-busy={!error} className="flex w-(--sidebar-width) shrink-0 flex-col gap-2 border-r border-line bg-rail px-3 py-4">
          {[0, 1, 2, 3, 4].map((row) => (
            <div key={row} className="flex items-center gap-2.5 py-1">
              <span className="size-8 shrink-0 rounded-full bg-hover-fill motion-safe:animate-pulse" />
              <span className="h-3 flex-1 rounded-full bg-hover-fill motion-safe:animate-pulse" style={{ maxWidth: `${70 - row * 8}%` }} />
            </div>
          ))}
        </nav>
        <main className="flex min-w-0 flex-1 items-center justify-center p-6">
          {error && (
            <div role="alert" className="flex max-w-sm flex-col items-center gap-3 text-center">
              <p className="text-sm text-ink-soft">{error} Check your connection, then try again.</p>
              <Button variant="outline" size="sm" onClick={onRetry}>
                Try again
              </Button>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
