import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { MateAvatar } from "../chat/MateAvatar.tsx";
import { crewFor, LEAD_ID } from "../data/sampleCrew.ts";
import { SummonPanel } from "../summon/SummonPanel.tsx";
import { nextMode, OPEN_WIDTH, parseNotch, shapeSize, type NotchEvent, type NotchMode } from "./notch.logic.ts";

const notch = parseNotch(window.location.search);
// UI only: the sample crew, as in the main window and the summon bar.
const { mates } = crewFor("Ama");
const lead = mates.find((mate) => mate.id === LEAD_ID)!;
const waiting = mates.find((mate) => mate.status === "waiting");
const working = mates.filter((mate) => mate.status === "working");

/** A hover has to settle this long before the notch peeks, so passing the pointer over it doesn't. */
const PEEK_DELAY_MS = 90;

/**
 * Mates in the MacBook notch. At rest, the camera housing has an ear each side: your lead mate on
 * the left, a dot on the right when someone's working (blue) or needs you (amber). Hover and it
 * widens to say who. Click it, or press Alt+Space, and it grows down into the summon bar; Escape
 * or clicking elsewhere tucks it back in. The shape is one black element whose size animates; the
 * window never resizes, and only the shape takes the pointer.
 */
export function Notch() {
  const [mode, setMode] = useState<NotchMode>("rest");
  const [session, setSession] = useState(0);
  const [opened, setOpened] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const content = useRef<HTMLDivElement>(null);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const send = (event: NotchEvent) => setMode((current) => nextMode(current, event));
  const open = mode === "open";

  // Alt+Space on this screen, and clicking anywhere else (the window loses focus) to close.
  useEffect(() => window.mates.notch.onToggle(() => send("toggle")), []);
  useEffect(() => {
    const close = () => send("close");
    window.addEventListener("blur", close);
    return () => window.removeEventListener("blur", close);
  }, []);

  // Open, it takes the keyboard so you can type; closed, it hands it straight back.
  useEffect(() => {
    if (open) {
      window.mates.notch.focus();
      setOpened((count) => count + 1);
    } else {
      window.mates.notch.blur();
    }
  }, [open]);

  // The panel is measured even while closed, so opening grows straight to the right height.
  useLayoutEffect(() => {
    const element = content.current!;
    const observer = new ResizeObserver(() => setContentHeight(element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const size = shapeSize(mode, notch, contentHeight);
  const style = { "--w": `${size.width}px`, "--h": `${size.height}px`, "--r": `${size.radius}px`, "--nh": `${notch.height}px`, "--nw": `${notch.width}px` } as CSSProperties;

  return (
    <div className="flex h-dvh justify-center">
      <div
        className="notch-shape"
        data-mode={mode}
        style={style}
        onPointerEnter={() => {
          window.mates.notch.setInteractive(true);
          peekTimer.current = setTimeout(() => send("hoverIn"), PEEK_DELAY_MS);
        }}
        onPointerLeave={() => {
          clearTimeout(peekTimer.current);
          window.mates.notch.setInteractive(false);
          send("hoverOut");
        }}
        onClick={open ? undefined : () => send("click")}
      >
        <div className="notch-ears" aria-hidden={open}>
          <div className="flex min-w-0 flex-1 items-center gap-2 ps-2.5">
            <MateAvatar mate={lead} size={18} />
            <span className="notch-ear-text truncate text-xs font-medium">{lead.name}</span>
          </div>
          <div className="shrink-0" style={{ width: notch.width }} />
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2 pe-3">
            <span className="notch-ear-text truncate text-xs text-ink-soft">
              {waiting ? `${waiting.name} needs you` : working.length ? `${working.map((mate) => mate.name).join(", ")} working` : "All quiet"}
            </span>
            {(waiting || working.length > 0) && <span className={waiting ? "size-2 shrink-0 rounded-full bg-caution" : "status-pulse size-2 shrink-0 rounded-full bg-brand"} />}
          </div>
        </div>

        <div className="notch-content" style={{ width: OPEN_WIDTH, paddingTop: notch.height }} inert={!open}>
          <div ref={content} className="pb-1.5">
            <SummonPanel
              key={session}
              focusSignal={opened}
              onReset={() => setSession(session + 1)}
              onHide={() => send("close")}
              onOpenInMates={(handoff) => {
                window.mates.notch.openInMates(handoff);
                setSession(session + 1);
                send("close");
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
