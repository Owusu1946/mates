import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { PolygonState } from "@muse-clone/mascot";
import Mascot from "./Mascot";
import "./Waitlist.css";

/**
 * The header's "Join waitlist" button and the sheet it opens. The mascot reacts as you go:
 * happy to see you, curious while you type, excited once the address looks right, thinking while
 * it sends, celebrating when you're in. Anything on the page with `data-waitlist` opens it too.
 *
 * A hand-built modal rather than <dialog>, which iOS Safari only gained in 15.4. It renders into
 * <body> through a portal: the sticky header's backdrop-filter would otherwise trap a fixed overlay
 * inside the header's own box.
 */

type Phase = "form" | "sending" | "done";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function Waitlist({ api }: { api: string }) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("form");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ position: number | null; already: boolean } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  const show = useCallback((from?: HTMLElement | null) => {
    returnTo.current = from ?? (document.activeElement as HTMLElement | null);
    setOpen(true);
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    returnTo.current?.focus?.();
  }, []);

  // Any element marked data-waitlist opens the sheet.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = (event.target as Element | null)?.closest?.("[data-waitlist]") as HTMLElement | null;
      if (!target) return;
      event.preventDefault();
      show(target);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [show]);

  // While open: lock the page, focus the field, Escape closes, Tab stays inside the sheet.
  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const previous = html.style.overflow;
    html.style.overflow = "hidden";
    const focusId = window.setTimeout(() => (phase === "form" ? input.current : card.current?.querySelector<HTMLElement>(".wl-submit"))?.focus(), 60);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") return close();
      if (event.key !== "Tab" || !card.current) return;
      const items = Array.prototype.slice.call(card.current.querySelectorAll("button, input:not([tabindex='-1']), a[href]")) as HTMLElement[];
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      html.style.overflow = previous;
      window.clearTimeout(focusId);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, phase, close]);

  const valid = EMAIL.test(email.trim());
  const mood: PolygonState = phase === "done" ? "celebrate" : phase === "sending" ? "thinking" : error ? "confused" : valid ? "excited" : email ? "curious" : "happy";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid) return setError("That email doesn’t look right yet.");
    const honeypot = (event.currentTarget.elements.namedItem("website") as HTMLInputElement | null)?.value ?? "";
    setError(null);
    setPhase("sending");
    try {
      const response = await fetch(`${api}/site/waitlist`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), website: honeypot, referrer: document.referrer }),
      });
      const body = (await response.json().catch(() => ({}))) as { position?: number | null; already?: boolean; error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Something went wrong.");
      setResult({ position: body.position ?? null, already: !!body.already });
      setPhase("done");
    } catch (err) {
      setPhase("form");
      setError(err instanceof Error && err.message !== "Failed to fetch" ? err.message : "Couldn’t reach us. Check your connection and try again.");
    }
  }

  const share = `https://x.com/intent/post?text=${encodeURIComponent("I just joined the waitlist for Mates: AI teammates that plan, hand off and finish real work.")}&url=${encodeURIComponent("https://agents.askorin.app")}`;

  return (
    <>
      <button ref={trigger} type="button" className="pill-button dark wl-trigger" onClick={() => show(trigger.current)}>
        Join waitlist
      </button>

      {open &&
        createPortal(
        <div className="wl-overlay" onMouseDown={(event) => event.target === event.currentTarget && close()}>
          <div ref={card} className="wl-card" role="dialog" aria-modal="true" aria-labelledby="wl-title">
            <button type="button" className="wl-close" aria-label="Close" onClick={close}>
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>

            <div className="wl-mascot">
              <span className={`wl-glow${phase === "done" ? " done" : ""}`} />
              <Mascot size={104} state={mood} />
            </div>

            {phase !== "done" ? (
              <form className="wl-body" onSubmit={submit} noValidate>
                <h2 id="wl-title">Get early access</h2>
                <p>Mates is coming to iPhone and Android. Join the waitlist and we’ll tell you the moment it’s ready.</p>
                <div className={`wl-field${error ? " invalid" : ""}`}>
                  <input
                    ref={input}
                    id="wl-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="off"
                    spellCheck={false}
                    placeholder="you@example.com"
                    aria-label="Email address"
                    aria-invalid={!!error}
                    aria-describedby={error ? "wl-error" : undefined}
                    value={email}
                    disabled={phase === "sending"}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      if (error) setError(null);
                    }}
                  />
                  {valid && phase === "form" && (
                    <span className="wl-ok" aria-hidden="true">
                      <svg width="14" height="14" viewBox="0 0 14 14">
                        <path d="m3 7.2 2.6 2.6L11 4.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  )}
                </div>
                {/* Hidden from people, irresistible to bots. */}
                <input className="wl-trap" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
                {error && (
                  <div id="wl-error" className="wl-error" role="alert">
                    {error}
                  </div>
                )}
                <button type="submit" className="pill-button dark wl-submit" disabled={phase === "sending"}>
                  {phase === "sending" ? (
                    <span className="wl-dots" aria-label="Joining">
                      <i />
                      <i />
                      <i />
                    </span>
                  ) : (
                    "Join the waitlist"
                  )}
                </button>
                <div className="wl-small">One email when we launch. No spam, ever.</div>
              </form>
            ) : (
              <div className="wl-body wl-done" aria-live="polite">
                <h2 id="wl-title">{result?.already ? "You’re already in!" : "You’re on the list!"}</h2>
                {result?.position ? (
                  <div className="wl-place">
                    <span>Your place</span>
                    <b>#{result.position.toLocaleString("en-US")}</b>
                  </div>
                ) : null}
                <p>We’ll email {email.trim()} the moment Mates is ready.</p>
                <a className="pill-button light wl-share" href={share} target="_blank" rel="noopener noreferrer">
                  Tell a friend on X
                </a>
                <button type="button" className="pill-button dark wl-submit" onClick={close}>
                  Done
                </button>
              </div>
            )}
          </div>
        </div>,
          document.body,
        )}
    </>
  );
}
