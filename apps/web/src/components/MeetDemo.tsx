import { useState, type CSSProperties } from "react";
import { mate, type Gradient } from "../palette";
import Mascot from "./Mascot";
import { useScene } from "./useScene";
import "./MeetDemo.css";

/**
 * A Google Meet call with a mate in it, drawn after Meet's own layout: four tiles, live captions,
 * the control bar. People talk; when someone says "Nova", the mate's tile lights up and it answers
 * in the captions. When the call ends, its notes slide in. Captions can be switched off like in
 * Meet; Replay starts the meeting again.
 */

type Person = { id: string; name: string; tint: Gradient };
const PEOPLE: Person[] = [
  { id: "ama", name: "Ama", tint: mate("rose") },
  { id: "kofi", name: "Kofi", tint: mate("sunset") },
  { id: "you", name: "You", tint: mate("slate") },
];
const NOVA = mate("blue");

const STEPS = ["idle", "ama1", "kofi1", "nova1", "ama2", "nova2", "ended", "notes"] as const;
type Step = (typeof STEPS)[number];
const LINES: Partial<Record<Step, { who: string; text: string }>> = {
  ama1: { who: "Ama", text: "So launch is the 24th. Kofi, are the release notes on track?" },
  kofi1: { who: "Kofi", text: "Nearly. Nova, what did we promise the beta testers?" },
  nova1: { who: "Nova", text: "Dark mode and faster sync. It’s in Tuesday’s notes, and I’ll add both to the release notes." },
  ama2: { who: "Ama", text: "Perfect. Nova, send everyone the summary after." },
  nova2: { who: "Nova", text: "Will do. I’ll send it as soon as we wrap up." },
};
const WAIT: Partial<Record<Step, number>> = { idle: 900, ama1: 3600, kofi1: 3200, nova1: 4600, ama2: 3000, nova2: 2800, ended: 900 };
const SPEAKER: Partial<Record<Step, string>> = { ama1: "ama", kofi1: "kofi", nova1: "nova", ama2: "ama", nova2: "nova" };

export default function MeetDemo() {
  const { root, step, setStep, at } = useScene(STEPS, (s) => WAIT[s]);
  const [captions, setCaptions] = useState(true);
  const speaking = SPEAKER[step];
  const line = LINES[step];
  const novaTalking = speaking === "nova";

  return (
    <div className="meet-demo" ref={root} style={{ "--md-end": mate("rose")[1], "--md-blue": NOVA[0], "--md-blue-ink": NOVA[2] } as CSSProperties}>
      <div className={`md-screen${at("ended") ? " ended" : ""}`}>
        <div className="md-grid">
          {PEOPLE.map((p) => (
            <div key={p.id} className={`md-tile${speaking === p.id ? " talking" : ""}`} style={{ "--tint": p.tint[0], "--ink": p.tint[2] } as CSSProperties}>
              <span className="md-face">{p.name[0]}</span>
              <span className="md-name">{p.name}</span>
              <Bars on={speaking === p.id} />
            </div>
          ))}
          <div className={`md-tile md-bot${novaTalking ? " talking" : ""}`}>
            <span className="md-notes-pill">
              <i /> Taking notes
            </span>
            <span className="md-mascot">
              <Mascot size={112} gradient={NOVA} shape="triangle" state={novaTalking ? "humming" : speaking ? "listening" : "idle"} />
            </span>
            <span className="md-name">Nova (Your mate)</span>
            <Bars on={novaTalking} />
          </div>
        </div>

        {captions && line && (
          <div className="md-caption" key={step}>
            <b>{line.who}</b>
            <span>{line.text}</span>
          </div>
        )}

        {at("notes") && (
          <aside className="md-summary" aria-live="polite">
            <div className="md-summary-head">
              <Mascot size={30} gradient={NOVA} shape="triangle" state="happy" />
              <div>
                <b>Launch sync notes</b>
                <small>From Nova · sent to Ama, Kofi and you</small>
              </div>
            </div>
            <h4>Decided</h4>
            <p>Launch on the 24th, with dark mode and faster sync.</p>
            <h4>Action items</h4>
            <ul>
              <li><i className="done" />Nova: add both to the release notes</li>
              <li><i />Kofi: finish the release notes by Thursday</li>
              <li><i />Ama: confirm the launch post</li>
            </ul>
            <button type="button" className="md-replay" onClick={() => setStep("idle")}>
              Replay
            </button>
          </aside>
        )}
      </div>

      <div className="md-bar">
        <span className="md-title">
          Launch sync <span>· 10:02</span>
        </span>
        <div className="md-controls" aria-hidden="true">
          <span className="md-btn"><Icon d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3" /></span>
          <span className="md-btn"><Icon d="M3 7h12v10H3zM15 10l6-3v10l-6-3" /></span>
          <span className="md-btn hide-sm"><Icon d="M3 4h18v12H3zM8 20h8M12 16v4M12 8v5M9.5 10.5 12 8l2.5 2.5" /></span>
          <span className="md-btn hide-sm"><Icon d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 14a4 4 0 0 0 7 0M9 9.5h.01M15 9.5h.01" /></span>
        </div>
        <button type="button" className={`md-btn md-cc${captions ? " on" : ""}`} aria-pressed={captions} aria-label="Captions" onClick={() => setCaptions((c) => !c)}>
          <Icon d="M3 5h18v14H3zM10 10.5a2 2 0 1 0 0 3M17 10.5a2 2 0 1 0 0 3" />
        </button>
        <span className="md-end" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 9c-2.6 0-5.1.6-7.3 1.7-.6.3-.9.9-.9 1.5v2.3c0 .7.6 1.2 1.3 1.1l3-.5c.6-.1 1-.6 1-1.2v-1.6c1.9-.5 3.9-.5 5.8 0v1.6c0 .6.4 1.1 1 1.2l3 .5c.7.1 1.3-.4 1.3-1.1v-2.3c0-.6-.3-1.2-.9-1.5C17.1 9.6 14.6 9 12 9z" /></svg>
        </span>
      </div>
    </div>
  );
}

function Bars({ on }: { on: boolean }) {
  return (
    <span className={`md-bars${on ? " on" : ""}`} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
