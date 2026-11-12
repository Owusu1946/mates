import { useRef, type CSSProperties } from "react";
import { mate } from "../palette";
import Mascot from "./Mascot";
import { useScene } from "./useScene";
import "./PhoneDemo.css";

/**
 * A mate making a phone call for you, in the Mates app: you ask, it shows who it will call and
 * what it will say, and waits for your OK (approved for you after a moment if you only watch).
 * Then the call screen: it says it's an AI, books the table, and the result lands in the chat.
 */

const NOVA = mate("blue");
const STEPS = ["idle", "you", "card", "dialing", "l1", "l2", "l3", "l4", "ended", "result"] as const;
type Step = (typeof STEPS)[number];
const WAIT: Partial<Record<Step, number>> = { idle: 700, you: 1000, dialing: 1600, l1: 2600, l2: 1800, l3: 2400, l4: 2400, ended: 1300 };
const CALL: Step[] = ["dialing", "l1", "l2", "l3", "l4", "ended"];
const TIMES: Partial<Record<Step, string>> = { dialing: "Calling…", l1: "0:04", l2: "0:09", l3: "0:15", l4: "0:22", ended: "Call ended · 0:27" };
const LINES: { at: Step; who: "nova" | "them"; text: string }[] = [
  { at: "l1", who: "nova", text: "Hi, I’m Nova, an AI assistant calling for Kenneth." },
  { at: "l2", who: "them", text: "Hi! How can I help?" },
  { at: "l3", who: "nova", text: "Could I book a table for four this Friday at 8?" },
  { at: "l4", who: "them", text: "Friday at 8 for four, under Kenneth. See you then!" },
];

export default function PhoneDemo() {
  const touched = useRef(false);
  const { root, step, setStep, at } = useScene(STEPS, (s) => (s === "card" ? (touched.current ? undefined : 4200) : WAIT[s]));
  const onCall = CALL.includes(step);

  const approve = () => {
    touched.current = true;
    setStep("dialing");
  };
  const replay = () => {
    touched.current = false;
    setStep("idle");
  };

  return (
    <div className="phone-demo" ref={root} style={{ "--pd-end": mate("rose")[1] } as CSSProperties}>
      <header className="pd-bar">
        <span className="pd-round" aria-hidden="true">
          <svg width="10" height="16" viewBox="0 0 10 16"><path d="M8.5 1.5 2 8l6.5 6.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <span className="pd-pill">
          <Mascot size={24} gradient={NOVA} shape="triangle" state="happy" />
          Nova
        </span>
        <span className="pd-round pd-ghost" aria-hidden="true" />
      </header>

      <div className="pd-thread" aria-live="polite">
        {at("you") && <p className="pd-me">Book a table for four at Osteria Rosa, Friday at 8.</p>}
        {at("card") && (
          <div className="pd-mate">
            <p>I’ll call them now. Here’s what I’ll ask:</p>
            <div className={`pd-card${at("dialing") ? " done" : ""}`}>
              <div className="pd-card-head">
                <span className="pd-phone" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z" /></svg>
                </span>
                <div>
                  <b>Call Osteria Rosa</b>
                  <small>+44 20 7946 0321</small>
                </div>
              </div>
              <span className="pd-ask">Table for 4 · Friday 8:00 pm · under Kenneth</span>
              {at("dialing") ? (
                <span className="pd-ok">Approved by you</span>
              ) : (
                <div className="pd-actions">
                  <button type="button" className="pd-approve" onClick={approve}>
                    Approve call
                  </button>
                  <button type="button" onClick={approve}>
                    Edit
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        {at("result") && (
          <div className="pd-mate">
            <div className="pd-result">
              <span className="pd-tick" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 16 16"><path d="m3.5 8.4 2.9 2.9 6.1-6.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
              <div>
                <b>Booked at Osteria Rosa</b>
                <small>Friday 8:00 pm · 4 people · under Kenneth</small>
              </div>
            </div>
            <div className="pd-chips">
              <span>Add to calendar</span>
              <span>Transcript · 0:27</span>
            </div>
            <button type="button" className="pd-replay" onClick={replay}>
              Replay
            </button>
          </div>
        )}
      </div>

      <div className="pd-composer" aria-hidden="true">
        <span className="pd-plus">+</span>
        <span>Ask your mates…</span>
      </div>

      {onCall && (
        <div className="pd-call">
          <div className="pd-call-top">
            <span className={`pd-halo${step !== "dialing" && step !== "ended" ? " live" : ""}`}>
              <Mascot size={96} gradient={NOVA} shape="triangle" state={step === "l1" || step === "l3" ? "humming" : "listening"} />
            </span>
            <b>Osteria Rosa</b>
            <small>Nova is calling for you · {TIMES[step]}</small>
          </div>
          <div className="pd-lines">
            {LINES.filter((l) => at(l.at)).map((l) => (
              <p key={l.at} className={l.who === "them" ? "pd-them" : "pd-nova"}>
                <small>{l.who === "them" ? "Osteria Rosa" : "Nova"}</small>
                {l.text}
              </p>
            ))}
          </div>
          <span className="pd-hang" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 9c-2.6 0-5.1.6-7.3 1.7-.6.3-.9.9-.9 1.5v2.3c0 .7.6 1.2 1.3 1.1l3-.5c.6-.1 1-.6 1-1.2v-1.6c1.9-.5 3.9-.5 5.8 0v1.6c0 .6.4 1.1 1 1.2l3 .5c.7.1 1.3-.4 1.3-1.1v-2.3c0-.6-.3-1.2-.9-1.5C17.1 9.6 14.6 9 12 9z" /></svg>
          </span>
        </div>
      )}
    </div>
  );
}
