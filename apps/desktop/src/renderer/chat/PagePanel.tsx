import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "../components/ui/Button.tsx";
import { Icon } from "../components/ui/Icon.tsx";
import { Favicon } from "./Favicon.tsx";

type PageState = { url: string; title: string; loading: boolean; canGoBack: boolean; canGoForward: boolean; error?: string };

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** An open dialog draws under the page (a native view is always on top), so the page steps aside while one is up. */
const dialogOpen = () => document.querySelector('[role="dialog"], [role="alertdialog"]') !== null;

/**
 * A web page beside the chat, opened from a citation or a source: back, forward, reload, the page's
 * title and site, and Open in browser. The page itself is a sandboxed view the app lays over the
 * space below the toolbar (main/window/DesktopPageView.ts); this keeps it on that space as the
 * panel slides open or is resized, and hides it when the panel goes or a dialog opens.
 */
export function PagePanel({ url }: { url: string }) {
  const space = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<PageState>({ url, title: "", loading: true, canGoBack: false, canGoForward: false });
  // A page that failed steps aside for the panel's own message; read when placing.
  const failed = useRef(false);
  const place = useRef(() => {});

  useEffect(() => window.mates.pages.onState(setState), []);
  useEffect(() => {
    failed.current = Boolean(state.error);
    place.current();
  }, [state.error]);

  useLayoutEffect(() => {
    const element = space.current!;
    let frame = 0;
    place.current = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect();
        window.mates.pages.place({ x: rect.left, y: rect.top, width: rect.width, height: rect.height }, !dialogOpen() && !failed.current);
      });
    };
    const placeNow = () => place.current();
    placeNow();
    const resized = new ResizeObserver(placeNow);
    resized.observe(element);
    // Dialogs and popovers mount straight into the page's body.
    const dialogs = new MutationObserver(placeNow);
    dialogs.observe(document.body, { childList: true });
    window.addEventListener("resize", placeNow);
    return () => {
      cancelAnimationFrame(frame);
      resized.disconnect();
      dialogs.disconnect();
      window.removeEventListener("resize", placeNow);
      window.mates.pages.place({ x: 0, y: 0, width: 0, height: 0 }, false);
    };
  }, []);

  const host = hostOf(state.url || url);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-0.5 border-b border-line px-1.5">
        <Button variant="ghost-muted" size="icon-xs" icon="chevronLeft" aria-label="Back" disabled={!state.canGoBack} onClick={() => window.mates.pages.act("back")} />
        <Button variant="ghost-muted" size="icon-xs" icon="chevronRight" aria-label="Forward" disabled={!state.canGoForward} onClick={() => window.mates.pages.act("forward")} />
        <Button variant="ghost-muted" size="icon-xs" icon={state.loading ? "x" : "retry"} aria-label={state.loading ? "Stop loading" : "Reload"} onClick={() => window.mates.pages.act(state.loading ? "stop" : "reload")} />
        <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
          {host && <Favicon domain={host} size={14} />}
          <span className="min-w-0 truncate text-xs">
            <span className="text-ink">{state.title || host}</span>
            {state.title && host && <span className="text-ink-soft"> · {host}</span>}
          </span>
        </div>
        <Button variant="ghost-muted" size="icon-xs" icon="external" aria-label="Open in your browser" onClick={() => window.mates.pages.openExternal()} />
      </div>
      {/* Pinned to the top while it loads, so you can see it's working. */}
      <div className="relative h-0.5 shrink-0 overflow-hidden">{state.loading && <span className="absolute inset-y-0 w-1/3 animate-[page-load_1.1s_ease-in-out_infinite] bg-brand" />}</div>
      <div ref={space} className="relative min-h-0 flex-1 bg-canvas">
        {state.error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-sm text-ink-soft">
            <Icon name="globe" size={20} />
            {state.error}
            <Button size="sm" variant="outline" onClick={() => window.mates.pages.openExternal()}>
              Open in your browser
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
