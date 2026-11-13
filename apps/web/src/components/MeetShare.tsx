import { useEffect, useMemo, useState } from "react";
import { sceneHtml, sceneOf, type Deck } from "@muse-clone/decks";

/**
 * The slides a mate presents in a meeting. Recall's bot shares this page as its screen (1280×720,
 * the slides' own size) while its camera stays the mascot. Silent: no microphone, no audio; the
 * mate's voice comes from the camera page. It follows the presentation by polling the API, and
 * draws each slide with the same scene code as the app and the PowerPoint export.
 */
type State = { deckId: string; slide: number; mode: string; version: number } | null;
type Shown = Pick<Deck, "title" | "theme" | "meta" | "slides" | "sources"> & { id: string; version: number };

const POLL_MS = 700;

/** The link carries the meeting, either the share token (?s=) or the camera page's token (?t=), and the API. */
export function presentationUrl(api: string, meeting: string, auth: { s?: string; t?: string }, deck = false) {
  const query = new URLSearchParams(auth.s ? { s: auth.s } : { t: auth.t ?? "" });
  return `${api}/site/meetings/${encodeURIComponent(meeting)}/presentation${deck ? "/deck" : ""}?${query}`;
}

/** Follows a meeting's presentation: the current slide index (0-based) of the deck being shown. */
export function usePresentation(api: string, meeting: string, auth: { s?: string; t?: string }, enabled = true) {
  const [state, setState] = useState<State>(null);
  const [deck, setDeck] = useState<Shown | null>(null);
  const [ended, setEnded] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let loaded: { id: string; version: number } | null = null;
    const tick = async () => {
      try {
        const response = await fetch(presentationUrl(api, meeting, auth), { cache: "no-store" });
        if (response.status === 404) return setEnded(true);
        if (!response.ok) return;
        const next = ((await response.json()) as { presentation: State }).presentation;
        if (stopped) return;
        setState(next);
        // The deck itself only when it changes: another deck, or an edit to this one.
        if (next && (loaded?.id !== next.deckId || loaded.version !== next.version)) {
          const body = (await (await fetch(presentationUrl(api, meeting, auth, true), { cache: "no-store" })).json()) as { deck?: Shown };
          if (body.deck && !stopped) {
            loaded = { id: body.deck.id, version: body.deck.version };
            setDeck(body.deck);
          }
        }
      } catch {
        // A blip; the next tick tries again.
      }
    };
    void tick();
    const timer = setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [api, meeting, auth.s, auth.t, enabled]);
  const shown = state && deck && deck.id === state.deckId ? { deck, index: Math.min(deck.slides.length, Math.max(1, state.slide)) - 1 } : null;
  return { shown, ended };
}

/** One slide, drawn at 1280×720 and scaled to `width`. It fades in when it changes. */
export function Slide({ deck, index, width = 1280 }: { deck: Shown; index: number; width?: number }) {
  const html = useMemo(() => sceneHtml(sceneOf(deck, index)), [deck, index]);
  const scale = width / 1280;
  return (
    <div style={{ width, height: 720 * scale, overflow: "hidden", position: "relative" }}>
      {/* Our own package draws this from deck data the API validated; nothing here comes from a page or a user's HTML. */}
      <div key={`${deck.id}:${deck.version}:${index}`} className="slide-in" style={{ width: 1280, height: 720, transform: `scale(${scale})`, transformOrigin: "top left" }} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

export function MeetShareFromUrl() {
  const query = new URLSearchParams(window.location.search);
  const [meeting, share, api] = [query.get("m"), query.get("s"), query.get("api")];
  if (!meeting || !share || !api?.startsWith("https://")) return <Card text="Mates" />;
  return <LiveShare meeting={meeting} share={share} api={api} />;
}

function LiveShare({ meeting, share, api }: { meeting: string; share: string; api: string }) {
  const auth = useMemo(() => ({ s: share }), [share]);
  const { shown, ended } = usePresentation(api, meeting, auth);
  if (!shown) return <Card text={ended ? "Thanks for watching" : "Mates"} />;
  return (
    <div style={{ width: 1280, height: 720, position: "relative" }}>
      <Slide deck={shown.deck} index={shown.index} />
      <div style={{ position: "absolute", right: 24, bottom: 18, padding: "6px 12px", borderRadius: 999, background: "rgba(10,10,10,0.55)", color: "#ffffff", fontFamily: "Arial, Helvetica, sans-serif", fontSize: 18, fontVariantNumeric: "tabular-nums" }}>
        {shown.index + 1} / {shown.deck.slides.length}
      </div>
    </div>
  );
}

/** Before the first slide and after the last: a calm card, never a blank or broken screen. */
function Card({ text }: { text: string }) {
  return (
    <div style={{ width: 1280, height: 720, display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f5f4", color: "#1c1917", fontFamily: "Arial, Helvetica, sans-serif", fontSize: 40, fontWeight: 600 }}>
      {text}
    </div>
  );
}
