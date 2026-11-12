import { useEffect, useState } from "react";
import { mate } from "../palette";
import Mascot from "./Mascot";
import { useScene } from "./useScene";
import "./DeckDemo.css";

/**
 * A mate building a pitch deck, laid out like a slides app: thumbnails down the side fill in one
 * by one, each checked once it's drawn, and the big slide follows along. When it's ready the
 * export buttons appear and the slides page through on their own; clicking a thumbnail picks one.
 * Then the mate offers to play the investor, and asks the hard question about slide 4.
 */

const NOVA = mate("blue");
const SLIDES = ["Title", "Problem", "Solution", "Market", "Traction", "The ask"] as const;
const STEPS = ["idle", "b1", "b2", "b3", "b4", "b5", "b6", "ready", "offer", "asking"] as const;
type Step = (typeof STEPS)[number];
const WAIT: Partial<Record<Step, number>> = { idle: 700, b1: 1000, b2: 1000, b3: 1000, b4: 1000, b5: 1000, b6: 1100, ready: 2600, offer: 4200 };
const TRACTION = [18, 26, 31, 44, 58, 76];
const NOTES = [
  "Open with the promise: restaurant pasta, at home, still hot.",
  "Everyone has had soggy delivery pasta. Ask the room.",
  "Small kitchens close to customers are the whole idea.",
  "Delivery orders for pasta doubled in three years.",
  "Weekly orders grew every month since launch.",
  "Close on the ask and what six kitchens unlock.",
];

export default function DeckDemo() {
  const { root, step, setStep, at } = useScene(STEPS, (s) => WAIT[s]);
  const built = Math.min(Math.max(STEPS.indexOf(step), 0), SLIDES.length);
  const ready = at("ready");
  const [picked, setPicked] = useState<number | null>(null);
  const [auto, setAuto] = useState(0);

  // Once it's ready and nobody has picked a slide, page through them.
  useEffect(() => {
    if (!ready || picked !== null) return;
    const id = setInterval(() => setAuto((n) => (n + 1) % SLIDES.length), 2600);
    return () => clearInterval(id);
  }, [ready, picked]);
  useEffect(() => {
    if (step === "idle") {
      setPicked(null);
      setAuto(0);
    }
  }, [step]);

  const shown = step === "asking" ? 3 : picked ?? (ready ? auto : Math.max(built - 1, 0));

  return (
    <div className="deck-demo" ref={root}>
      <div className="dk-top">
        <div className="dk-file">
          <span className="dk-icon" aria-hidden="true" />
          <div>
            <b>Osteria Rosa · Seed deck</b>
            <small>
              {ready ? "Ready · 6 slides, every one checked" : built ? `Nova is building · slide ${built} of 6` : "Nova is outlining…"}
            </small>
          </div>
        </div>
        <div className={`dk-export${ready ? " on" : ""}`} aria-hidden={!ready}>
          <span>PowerPoint</span>
          <span>PDF</span>
          <span>Google Slides</span>
        </div>
      </div>

      <div className="dk-body">
        <ol className="dk-rail">
          {SLIDES.map((name, i) => (
            <li key={name}>
              <button
                type="button"
                className={`dk-thumb${i < built ? " built" : i === built && !ready ? " making" : ""}${i === shown && i < built ? " on" : ""}`}
                disabled={i >= built}
                aria-label={`Slide ${i + 1}: ${name}`}
                onClick={() => setPicked(i)}
              >
                <span className="dk-num">{i + 1}</span>
                <span className="dk-mini">{i < built && <Slide index={i} />}</span>
                {i < built && (
                  <span className="dk-check" aria-hidden="true">
                    <svg width="10" height="10" viewBox="0 0 16 16"><path d="m3.5 8.4 2.9 2.9 6.1-6.6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                )}
              </button>
            </li>
          ))}
        </ol>

        <div className="dk-stage">
          <div className="dk-main" key={built ? shown : "empty"}>
            {built ? <Slide index={shown} /> : <div className="dk-skeleton"><i /><i /><i /></div>}
          </div>
          <div className="dk-notes">
            <small>Speaker notes</small>
            <p key={built ? shown : "empty"}>{built ? NOTES[shown] : "Writing the story first…"}</p>
          </div>

          {at("offer") && (
            <div className="dk-pitch" aria-live="polite">
              <Mascot size={40} gradient={NOVA} shape="triangle" state={step === "asking" ? "suspicious" : "happy"} />
              {step === "asking" ? (
                <div className="dk-bubble">
                  <small>Nova · playing the investor</small>
                  Slide 4 says the market doubled. Doubled from what?
                  <button type="button" className="dk-link" onClick={() => setStep("idle")}>
                    Replay
                  </button>
                </div>
              ) : (
                <div className="dk-bubble">
                  Want to practise? I’ll play the investor.
                  <button type="button" className="dk-go" onClick={() => setStep("asking")}>
                    Pitch it to me
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Slide({ index }: { index: number }) {
  switch (index) {
    case 0:
      return (
        <div className="sl sl-title">
          <span className="sl-rule" />
          <h5>Osteria Rosa</h5>
          <p>Fresh pasta, at your door in 20 minutes</p>
          <small>Seed round · 2027</small>
        </div>
      );
    case 1:
      return (
        <div className="sl">
          <h6>Problem</h6>
          <h5>Good pasta doesn’t travel.</h5>
          <ul>
            <li>Delivered pasta arrives cold and soggy</li>
            <li>Restaurants cook it 40 minutes away</li>
            <li>So people stop ordering it</li>
          </ul>
        </div>
      );
    case 2:
      return (
        <div className="sl">
          <h6>Solution</h6>
          <h5>Cooked to order, five minutes away.</h5>
          <div className="sl-steps">
            <span><b>1</b>Small kitchens in every area</span>
            <span><b>2</b>Pasta cooked when you order</span>
            <span><b>3</b>At your door in 20 minutes</span>
          </div>
        </div>
      );
    case 3:
      return (
        <div className="sl sl-market">
          <h6>Market</h6>
          <span className="sl-big">2x</span>
          <p>Pasta delivery orders in our city, 2023 to 2026</p>
        </div>
      );
    case 4:
      return (
        <div className="sl">
          <h6>Traction</h6>
          <h5>Orders a week, last six months</h5>
          <div className="sl-bars">
            {TRACTION.map((h, i) => (
              <i key={i} style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
      );
    default:
      return (
        <div className="sl">
          <h6>The ask</h6>
          <h5>Raising $750k to open six kitchens.</h5>
          <div className="sl-split">
            <span style={{ flex: 5 }}>Kitchens</span>
            <span style={{ flex: 3 }}>Team</span>
            <span style={{ flex: 2 }}>Launch</span>
          </div>
        </div>
      );
  }
}
