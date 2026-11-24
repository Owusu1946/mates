import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SummonPanel } from "./SummonPanel.tsx";

/**
 * The summon bar as a floating pill: Alt+Space (⌥Space on a Mac) from any app opens it, centred
 * near the top of the screen. Escape clears the answer, then hides the bar; each clear starts a
 * fresh conversation. On a MacBook with a notch, the same panel lives in the notch instead.
 */
export function SummonBar() {
  const [session, setSession] = useState(0);
  const [shown, setShown] = useState(0);
  const root = useRef<HTMLDivElement>(null);

  // The window is as tall as what's in it.
  useLayoutEffect(() => {
    const element = root.current!;
    const observer = new ResizeObserver(() => window.mates.summon.resize(element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => window.mates.summon.onShown(() => setShown((count) => count + 1)), []);

  return (
    // The padding holds the whole shadow: the window is square and see-through, so a shadow that
    // spilled past it would be cut off at the window's edge. No blur either: a see-through window
    // can't blur the apps behind it, so the pill is solid.
    <div ref={root} className="px-6 pt-3 pb-8">
      <div className="overflow-hidden rounded-[26px] border border-line bg-raised text-ink shadow-[0_10px_28px_-10px_rgb(0_0_0/0.35),0_2px_6px_-2px_rgb(0_0_0/0.12)] dark:border-white/10 dark:shadow-[0_10px_28px_-10px_rgb(0_0_0/0.8),0_2px_6px_-2px_rgb(0_0_0/0.4)]">
        <SummonPanel
          key={session}
          focusSignal={shown}
          onReset={() => setSession(session + 1)}
          onHide={() => window.mates.summon.hide()}
          onOpenInMates={(handoff) => window.mates.summon.openInMates(handoff)}
        />
      </div>
    </div>
  );
}
