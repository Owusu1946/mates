import { useEffect, useState } from "react";
import type { PolygonState } from "@muse-clone/mascot";
import Mascot from "./Mascot";
import "./BackToTop.css";

/**
 * A small mascot that rides along once you're past the hero. The ring around it fills as you read
 * down the page; it perks up when you reach the end, and bounces you back to the top when tapped.
 */

const SHOW_AFTER = 640;
const RING = 2 * Math.PI * 27;

export default function BackToTop() {
  const [shown, setShown] = useState(false);
  const [progress, setProgress] = useState(0);
  const [hover, setHover] = useState(false);
  const [flying, setFlying] = useState(false);

  useEffect(() => {
    // Two cheap reads per scroll event; React skips the render when nothing changed.
    const measure = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const y = window.scrollY || window.pageYOffset;
      setShown(y > SHOW_AFTER);
      // Rounded to a 1% step so small scrolls don't re-render.
      setProgress(max > 0 ? Math.round(Math.min(1, y / max) * 100) / 100 : 0);
      if (y < 40) setFlying(false);
    };
    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, []);

  const goUp = () => {
    setFlying(true);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Smooth where supported (Safari 15.4+); an instant jump elsewhere still does the job.
    try {
      window.scrollTo({ top: 0, behavior: still ? "auto" : "smooth" });
    } catch {
      window.scrollTo(0, 0);
    }
    document.querySelector<HTMLElement>("a.brand")?.focus({ preventScroll: true } as FocusOptions);
  };

  const mood: PolygonState = flying ? "bouncing" : progress > 0.97 ? "excited" : hover ? "curious" : "happy";

  return (
    <button
      type="button"
      className={`btt${shown ? " shown" : ""}${flying ? " flying" : ""}`}
      aria-label="Back to top"
      aria-hidden={!shown}
      tabIndex={shown ? 0 : -1}
      onClick={goUp}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
    >
      <span className="btt-label">Back to top</span>
      <span className="btt-orb">
        <svg className="btt-ring" viewBox="0 0 60 60" aria-hidden="true">
          <circle cx="30" cy="30" r="27" className="btt-track" />
          <circle cx="30" cy="30" r="27" className="btt-fill" strokeDasharray={RING} strokeDashoffset={RING * (1 - progress)} />
        </svg>
        <Mascot size={34} state={mood} />
        <svg className="btt-arrow" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M6 10V2M2.5 5.5 6 2l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </button>
  );
}
