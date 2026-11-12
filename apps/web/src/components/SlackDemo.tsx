import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { PolygonState } from "@muse-clone/mascot";
import { mate, type Gradient } from "../palette";
import type { ShapeName } from "../shapes";
import Mascot from "./Mascot";
import "./SlackDemo.css";

/**
 * Mates in a Slack channel, laid out like Slack's phone app so it reads at a glance: you mention
 * @Mates and name a mate, it checks in, asks before sending, then hands the next part to another
 * mate. True to how Slack works: there is one app to mention, and each mate posts through it under
 * its own name with its mascot as the picture (chat:write.customize); mates aren't Slack users, so
 * a handoff names the mate in bold rather than as a mention. Approve and Change both work; a
 * visitor who just watches sees it approved after a moment.
 */

type BotMate = { name: string; gradient: Gradient; shape?: ShapeName };
type Slot = { day: string; time: string };

const NOVA: BotMate = { name: "Nova", gradient: mate("blue"), shape: "triangle" };
const IVY: BotMate = { name: "Ivy", gradient: mate("green"), shape: "circle" };
const SLOTS: Slot[] = [
  { day: "Tuesday", time: "10:00" },
  { day: "Wednesday", time: "14:00" },
];
const CHANNEL = "launch-plan";
// Slack's aubergine and mention blue, taken from the mates' own colours.
const TINTS = { "--sd-home": mate("purple")[2], "--sd-mention": mate("blue")[0], "--sd-mention-ink": mate("blue")[2] } as CSSProperties;

// The thread plays forward one step at a time; the approval card waits at "asking".
const STEPS = ["empty", "you", "checking", "asking", "approved", "sent", "drafting", "done"] as const;
type Step = (typeof STEPS)[number];
const AFTER: Partial<Record<Step, number>> = { empty: 700, you: 900, checking: 1900, approved: 800, sent: 1000, drafting: 2200 };
const AUTO_APPROVE_MS = 4200;

export default function SlackDemo() {
  const root = useRef<HTMLDivElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>("empty");
  const [slot, setSlot] = useState(0);
  const [visible, setVisible] = useState(false);
  const touched = useRef(false);
  const at = (s: Step) => STEPS.indexOf(step) >= STEPS.indexOf(s);

  // Only play while someone can see it; reduced motion shows the finished thread.
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setStep("done");
      return;
    }
    const node = root.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(!!entry?.isIntersecting), { threshold: 0.35 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const wait = AFTER[step] ?? (step === "asking" && !touched.current ? AUTO_APPROVE_MS : undefined);
    if (wait === undefined) return;
    const id = setTimeout(() => setStep(STEPS[STEPS.indexOf(step) + 1]!), wait);
    return () => clearTimeout(id);
  }, [visible, step]);

  // New messages land at the bottom, like the app.
  useEffect(() => {
    const node = thread.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [step, slot]);

  const approve = () => {
    touched.current = true;
    setStep("approved");
  };
  const change = () => {
    touched.current = true;
    setSlot((s) => (s + 1) % SLOTS.length);
  };
  const replay = useCallback(() => {
    touched.current = false;
    setSlot(0);
    setStep("empty");
  }, []);

  const { day, time } = SLOTS[slot]!;

  return (
    <div className="slack-demo" ref={root} style={TINTS}>
      <header className="sd-bar">
        <span className="sd-round" aria-hidden="true">
          <svg width="10" height="16" viewBox="0 0 10 16"><path d="M8.5 1.5 2 8l6.5 6.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <div className="sd-channel">
          <b><span className="sd-hash">#</span> {CHANNEL}</b>
          <span>3 members · 2 tabs</span>
        </div>
        <span className="sd-round" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 15v-3a8 8 0 0 1 16 0v3" /><rect x="3" y="14" width="4" height="7" rx="2" /><rect x="17" y="14" width="4" height="7" rx="2" /></svg>
        </span>
      </header>

      <div className="sd-thread" ref={thread} aria-live="polite">
        <div className="sd-day">Today</div>

        {at("you") && (
          <Message author="Kenneth" avatar={<span className="sd-you">K</span>} time="9:41">
            <span className="sd-mention">@Mates</span> Nova, find a time with Ivy next week and send the invite
          </Message>
        )}

        {at("checking") && (
          <Message author={NOVA.name} avatar={<Face mate={NOVA} state={at("asking") ? "happy" : "thinking"} />} time="9:41" app>
            {at("asking") ? (
              <>
                <p>
                  {day} {time} works for you and Ivy.
                </p>
                <div className={`sd-card${at("approved") ? " done" : ""}`}>
                  <b>Send invite</b>
                  <span>
                    Launch sync · {day.slice(0, 3)} {time} · 30 min · 3 guests
                  </span>
                  {at("approved") ? (
                    <span className="sd-approved">
                      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.4 2.9 2.9 6.1-6.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      Approved by you
                    </span>
                  ) : (
                    <>
                      <div className="sd-actions">
                        <button type="button" className="sd-approve" onClick={approve}>
                          Approve
                        </button>
                        <button type="button" onClick={change}>
                          Change
                        </button>
                      </div>
                      <small>Only you can approve</small>
                    </>
                  )}
                </div>
              </>
            ) : (
              <p className="sd-status">
                <span className="sd-spinner" aria-hidden="true" />
                Checking both calendars…
              </p>
            )}
            {at("sent") && (
              <p>
                Invite sent. <b>Ivy</b>, can you draft the agenda?
              </p>
            )}
          </Message>
        )}

        {at("drafting") && (
          <Message author={IVY.name} avatar={<Face mate={IVY} state={at("done") ? "happy" : "working"} />} time="9:42" app>
            {at("done") ? (
              <>
                <p>Agenda’s in the invite:</p>
                <ol>
                  <li>Where the launch stands</li>
                  <li>What’s blocking the beta</li>
                  <li>Who owns each next step</li>
                </ol>
              </>
            ) : (
              <p className="sd-status">
                <span className="sd-spinner" aria-hidden="true" />
                Drafting the agenda…
              </p>
            )}
          </Message>
        )}

        {step === "done" && (
          <button type="button" className="sd-replay" onClick={replay}>
            Replay
          </button>
        )}
      </div>

      <div className="sd-composer" aria-hidden="true">
        <span className="sd-plus">
          <svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </span>
        <span className="sd-field">Message #{CHANNEL}</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
      </div>

      <nav className="sd-tabs" aria-hidden="true">
        <div className="sd-tabset">
          <span className="sd-tab on">
            <svg width="20" height="20" viewBox="0 0 24 24"><path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z" fill="currentColor" /><rect x="10" y="12" width="4" height="4" rx="1" fill="var(--bg)" /></svg>
            Home
          </span>
          <span className="sd-tab">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M14 9a5 5 0 1 0-9.4 2.4L4 14l2.6-.6A5 5 0 0 0 14 9z" /><path d="M10.5 16.5A5 5 0 0 0 19.4 18l.6 2.5-2.6-.6" /></svg>
            DMs
          </span>
          <span className="sd-tab">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></svg>
            Activity
          </span>
          <span className="sd-tab">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
            More
          </span>
        </div>
        <span className="sd-search">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></svg>
        </span>
      </nav>
    </div>
  );
}

function Message({ author, avatar, time, app, children }: { author: string; avatar: ReactNode; time: string; app?: boolean; children: ReactNode }) {
  return (
    <div className="sd-msg">
      <div className="sd-avatar">{avatar}</div>
      <div className="sd-body">
        <div className="sd-head">
          <b>{author}</b>
          {app && <span className="sd-app">APP</span>}
          <time>{time}</time>
        </div>
        <div className="sd-text">{children}</div>
      </div>
    </div>
  );
}

function Face({ mate: m, state }: { mate: BotMate; state: PolygonState }) {
  return <Mascot size={38} gradient={m.gradient} shape={m.shape} state={state} />;
}
