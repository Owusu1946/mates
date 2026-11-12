import { useEffect, useRef, useState } from "react";
import type { PolygonState } from "@muse-clone/mascot";
import type { Participant, RemoteTrack, Room } from "livekit-client";
import { MATE, type Gradient } from "../palette";
import { SHAPES, type ShapeName } from "../shapes";
import Mascot from "./Mascot";

/**
 * A mate's camera in a meeting. Recall's bot loads this page and streams it as the bot's video
 * (1280×720) and audio, and hands it the meeting's audio as its microphone. The page joins the
 * meeting's LiveKit room like the phone joins a call: the meeting's audio goes to the voice agent,
 * and the agent's voice plays here, so the meeting hears the mate. The mascot shows what it's doing,
 * and what it says appears as a caption. Meet already shows the mate's name under the tile.
 */
type Session = { serverUrl: string; token: string; mate: { name: string; color: string; shape: string } };
type Phase = "starting" | "live" | "ended" | "failed";

/** Loudness (RMS) above which someone in the meeting is talking, and how long it lingers. */
const TALKING = 0.02;
const LINGER_MS = 700;

/** The link Recall opens carries the meeting, its token and the API: ?m=…&t=…&api=… */
export function MeetBotFromUrl() {
  const query = new URLSearchParams(window.location.search);
  const [meeting, token, api] = [query.get("m"), query.get("t"), query.get("api")];
  // Without a meeting (a preview), show the mate the link names.
  if (!meeting || !token || !api?.startsWith("https://")) return <Tile name={query.get("name") ?? "Your mate"} color={query.get("color") ?? "amber"} shape={query.get("shape") ?? "hexagon"} state="happy" pill="Taking notes" />;
  return <LiveMeetBot meeting={meeting} token={token} api={api} />;
}

function LiveMeetBot({ meeting, token, api }: { meeting: string; token: string; api: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const [agentState, setAgentState] = useState("");
  const [hearing, setHearing] = useState(false);
  const [caption, setCaption] = useState("");
  const leaving = useRef(false);

  useEffect(() => {
    let room: Room | null = null;
    let stopMeter = () => {};
    const leave = () => {
      if (leaving.current) return;
      leaving.current = true;
      void fetch(`${api}/site/meetings/${encodeURIComponent(meeting)}/leave?t=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => {});
    };

    (async () => {
      const response = await fetch(`${api}/site/meetings/${encodeURIComponent(meeting)}/session?t=${encodeURIComponent(token)}`);
      if (!response.ok) throw new Error(`session ${response.status}`);
      const started = (await response.json()) as Session;
      setSession(started);

      // Inside Recall's bot this is the meeting's audio: everyone but the bot itself.
      const meetingAudio = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
      stopMeter = meter(meetingAudio, setHearing);

      const { Room, RoomEvent, Track, LocalAudioTrack } = await import("livekit-client");
      room = new Room({ adaptiveStream: false, dynacast: false });
      const watch = (participant: Participant) => {
        if (!participant.isAgent) return;
        setAgentState(participant.attributes?.["lk.agent.state"] ?? "");
        if (participant.attributes?.["mates.ending"] === "true") leave();
      };
      room
        .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _publication, participant) => {
          // The mate's voice: playing it here is what the meeting hears.
          if (track.kind === Track.Kind.Audio && participant.isAgent) document.body.appendChild(track.attach());
        })
        .on(RoomEvent.ParticipantConnected, watch)
        .on(RoomEvent.ParticipantAttributesChanged, (_changed, participant) => watch(participant))
        .on(RoomEvent.ParticipantDisconnected, (participant) => {
          if (participant.isAgent) setPhase("ended");
        })
        .on(RoomEvent.Disconnected, () => setPhase((current) => (current === "failed" ? current : "ended")));
      room.registerTextStreamHandler("lk.transcription", async (reader, from) => {
        if (from.identity === room?.localParticipant.identity) return;
        let text = "";
        for await (const chunk of reader) {
          text += chunk;
          setCaption(text.trim());
        }
      });

      await room.connect(started.serverUrl, started.token);
      await room.localParticipant.publishTrack(new LocalAudioTrack(meetingAudio.getAudioTracks()[0]!), { source: Track.Source.Microphone });
      // Some browsers hold audio until it's allowed; Recall's bot allows it, and this asks anyway.
      await room.startAudio().catch(() => {});
      for (const participant of room.remoteParticipants.values()) watch(participant);
      setPhase("live");
    })().catch((error: unknown) => {
      console.error("meet_bot_failed", error);
      setPhase("failed");
    });

    return () => {
      stopMeter();
      void room?.disconnect();
    };
  }, [api, meeting, token]);

  // The caption fades a few seconds after the mate stops talking.
  useEffect(() => {
    if (!caption || agentState === "speaking") return;
    const id = setTimeout(() => setCaption(""), 4000);
    return () => clearTimeout(id);
  }, [caption, agentState]);

  const state: PolygonState =
    phase === "failed" ? "sad" : agentState === "speaking" ? "humming" : agentState === "thinking" ? "thinking" : hearing ? "listening" : phase === "starting" ? "waking" : "idle";
  const pill = phase === "failed" ? "Couldn’t connect" : phase === "ended" ? "Notes on the way" : phase === "starting" ? "Joining…" : "Taking notes";
  return <Tile name={session?.mate.name ?? "Your mate"} color={session?.mate.color ?? "amber"} shape={session?.mate.shape ?? "hexagon"} state={state} pill={pill} caption={caption} />;
}

/** Watches the meeting's loudness, so the mascot looks like it's listening when people talk. */
function meter(stream: MediaStream, onHearing: (hearing: boolean) => void) {
  const context = new AudioContext();
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  context.createMediaStreamSource(stream).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  let lastHeard = 0;
  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    const rms = Math.sqrt(samples.reduce((sum, v) => sum + v * v, 0) / samples.length);
    if (rms > TALKING) lastHeard = Date.now();
    onHearing(Date.now() - lastHeard < LINGER_MS);
  }, 100);
  return () => {
    clearInterval(timer);
    void context.close();
  };
}

function Tile({ name, color, shape, state, pill, caption }: { name: string; color: string; shape: string; state: PolygonState; pill: string; caption?: string }) {
  const gradient = ((MATE as Record<string, readonly string[]>)[color] ?? MATE.amber) as unknown as Gradient;
  const silhouette = (shape in SHAPES ? shape : "hexagon") as ShapeName;
  const font = "ui-sans-serif, system-ui, sans-serif";
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
        // A flat colour: meeting video is heavily compressed, and gradients turn to blur and banding.
        background: `color-mix(in srgb, ${gradient[0]} 38%, #ffffff)`,
      }}
      aria-label={`${name}, from Mates`}
    >
      <Mascot size={480} gradient={gradient} shape={silhouette} state={state} />
      <div style={{ position: "absolute", top: 28, left: 32, display: "flex", alignItems: "center", gap: 10, padding: "10px 18px", borderRadius: 999, background: "#ffffff", fontFamily: font, fontSize: 24, fontWeight: 600, color: "#0a0a0a" }}>
        <span style={{ width: 12, height: 12, borderRadius: "50%", background: MATE.rose[1] }} />
        {pill}
      </div>
      {caption && (
        <div style={{ position: "absolute", left: 80, right: 80, bottom: 44, padding: "16px 24px", borderRadius: 18, background: "rgba(10,10,10,0.8)", color: "#ffffff", fontFamily: font, fontSize: 30, lineHeight: 1.35, textAlign: "center" }}>
          {caption.length > 160 ? `…${caption.slice(-160)}` : caption}
        </div>
      )}
    </div>
  );
}
