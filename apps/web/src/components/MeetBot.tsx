import { useEffect, useState } from "react";
import type { PolygonState } from "@muse-clone/mascot";
import { MATE, type Gradient } from "../palette";
import { SHAPES, type ShapeName } from "../shapes";
import Mascot from "./Mascot";

/**
 * A mate's camera in a meeting. Recall's bot loads this page and streams it as the bot's video
 * (1280×720), and gives it the meeting's audio as its microphone. The mascot listens when someone
 * talks; Meet already shows the mate's name under the tile, so the page carries none of its own.
 */
type Props = { name: string; color: string; shape: string };

/** The page is static: Recall's link carries which mate it is (?name=Ama&color=blue&shape=cloud). */
export function MeetBotFromUrl() {
  const query = new URLSearchParams(window.location.search);
  return <MeetBot name={query.get("name")?.slice(0, 40) || "Your mate"} color={query.get("color") ?? "amber"} shape={query.get("shape") ?? "hexagon"} />;
}

/** Loudness (RMS) above which someone is talking, and how long it lingers after they stop. */
const TALKING = 0.02;
const LINGER_MS = 700;

export default function MeetBot({ name, color, shape }: Props) {
  const gradient = ((MATE as Record<string, readonly string[]>)[color] ?? MATE.amber) as unknown as Gradient;
  const silhouette = (shape in SHAPES ? shape : "hexagon") as ShapeName;
  const [state, setState] = useState<PolygonState>("happy");
  const [hearing, setHearing] = useState<"waiting" | "on" | "off">("waiting");

  useEffect(() => {
    let stop = () => {};
    (async () => {
      try {
        // Inside Recall's bot this is the meeting's audio (everyone but the bot itself).
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const context = new AudioContext();
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        context.createMediaStreamSource(stream).connect(analyser);
        const samples = new Float32Array(analyser.fftSize);
        let lastHeard = 0;
        const timer = setInterval(() => {
          analyser.getFloatTimeDomainData(samples);
          const rms = Math.sqrt(samples.reduce((sum, v) => sum + v * v, 0) / samples.length);
          const now = Date.now();
          if (rms > TALKING) lastHeard = now;
          setState(now - lastHeard < LINGER_MS ? "listening" : "idle");
        }, 100);
        setHearing("on");
        stop = () => {
          clearInterval(timer);
          stream.getTracks().forEach((track) => track.stop());
          void context.close();
        };
      } catch {
        setHearing("off");
        setState("idle");
      }
    })();
    return () => stop();
  }, []);

  return (
    <div
      style={{
        width: 1280,
        height: 720,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
        background: `radial-gradient(circle at 50% 45%, color-mix(in srgb, ${gradient[0]} 55%, #ffffff), color-mix(in srgb, ${gradient[0]} 22%, #ffffff))`,
      }}
      aria-label={`${name}, from Mates`}
    >
      <Mascot size={400} gradient={gradient} shape={silhouette} state={state} />
      <div
        style={{
          position: "absolute",
          top: 28,
          left: 32,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 18px",
          borderRadius: 999,
          background: "#ffffff",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          fontSize: 24,
          fontWeight: 600,
          color: "#0a0a0a",
        }}
      >
        <span style={{ width: 12, height: 12, borderRadius: "50%", background: hearing === "off" ? "#6e6e73" : MATE.rose[1] }} />
        {hearing === "off" ? "Can’t hear the meeting" : "Taking notes"}
      </div>
    </div>
  );
}
