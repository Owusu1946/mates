import { useAuth } from "@clerk/expo";
import { AudioModule } from "expo-audio";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Linking, Platform } from "react-native";
import type { Participant, RemoteParticipant, Room } from "livekit-client";
import { runRequest } from "../chat/background-chat";
import { haptic } from "../haptics";
import { useSession } from "../session/provider";
import { asMember, type BotMate, type CallMember, type CallPhase, type CallRoster, type CallSession, type CallSummary, type Caption } from "./call-types";

// A real call: the API creates it and signs a LiveKit token that dispatches the voice agent, which
// speaks for every mate on the call. The agent tells us who's present and who's talking through its
// participant attributes; captions come from LiveKit's transcription stream.

type LiveKit = typeof import("@livekit/react-native") & { client: typeof import("livekit-client") };
let loaded: LiveKit | null = null;
/** Loaded on first call so Expo Go, which lacks the native module, never touches it. */
function liveKit(): LiveKit {
  if (!loaded) {
    const native = require("@livekit/react-native") as typeof import("@livekit/react-native");
    native.registerGlobals();
    loaded = { ...native, client: require("livekit-client") as typeof import("livekit-client") };
  }
  return loaded;
}

type StartedCall = { callId: string; serverUrl: string; token: string };
/** The agent has this long to pick up before the call counts as failed. */
const PICKUP_MS = 20_000;
const MAX_CALL_MATES = 4;

async function microphoneAllowed() {
  const permission = await AudioModule.requestRecordingPermissionsAsync();
  if (permission.granted) return true;
  Alert.alert("Microphone is off", "Allow microphone access in Settings to talk to your mates.", [
    { text: "Not now", style: "cancel" },
    { text: "Open Settings", onPress: () => void Linking.openSettings() },
  ]);
  return false;
}

/** What the mates call the user: a first name, never an email address. */
const firstName = (displayName?: string) => (displayName && !displayName.includes("@") ? displayName.trim().split(/\s+/)[0] : undefined);

const outputFor =(speaker: boolean) => (Platform.OS === "ios" ? (speaker ? "force_speaker" : "default") : speaker ? "speaker" : "earpiece");

export function useLiveCallSession(roster: CallRoster): CallSession {
  const { getToken } = useAuth();
  const session = useSession();
  const [phase, setPhase] = useState<CallPhase>("lobby");
  const rosterRef = useRef(roster);
  if (phase === "lobby") rosterRef.current = roster;
  const [invited, setInvited] = useState<string[]>([]);
  const [members, setMembers] = useState<CallMember[]>([]);
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [summary, setSummary] = useState<CallSummary | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const room = useRef<Room | null>(null);
  const agent = useRef<RemoteParticipant | null>(null);
  const pickup = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startAttempt = useRef(0);
  const startInFlight = useRef(false);
  const startRequest = useRef<AbortController | null>(null);
  /** Set when we hang up ourselves, so the disconnect isn't read as a dropped call. */
  const leaving = useRef(false);
  const elapsedRef = useRef(0);
  elapsedRef.current = elapsed;
  const membersRef = useRef(members);
  membersRef.current = members;

  const mateById = (id: string): BotMate | undefined => {
    const { lead, others } = rosterRef.current;
    return id === lead.id ? lead : others.find((m) => m.id === id);
  };

  /** Members and the speaking tile, from the agent's attributes. */
  const applyAgentState = useCallback((participant: Participant) => {
    const attributes = participant.attributes ?? {};
    let present: string[] = [];
    try {
      present = JSON.parse(attributes["mates.present"] ?? "[]") as string[];
    } catch {}
    const talking = attributes["lk.agent.state"] === "speaking" ? attributes["mates.speaker"] : undefined;
    if (!present.length) return;
    if (pickup.current) clearTimeout(pickup.current);
    pickup.current = null;
    setPhase((current) => (current === "connecting" ? "live" : current));
    setMembers((list) => {
      const joined = present.map((id) => mateById(id)).filter((m): m is BotMate => !!m).map((mate) => ({ ...asMember(mate, "joined"), speaking: mate.id === talking }));
      // Mates invited a moment ago stay as "joining" until the agent lists them.
      const pending = list.filter((m) => m.status === "joining" && !present.includes(m.id) && m.id !== rosterRef.current.lead.id);
      return [...joined, ...pending];
    });
  }, []);

  const cleanup = useCallback(async () => {
    if (pickup.current) clearTimeout(pickup.current);
    pickup.current = null;
    const current = room.current;
    room.current = null;
    agent.current = null;
    await current?.disconnect().catch(() => {});
    if (loaded) await loaded.AudioSession.stopAudioSession().catch(() => {});
  }, []);
  useEffect(() => () => { leaving.current = true; void cleanup(); }, [cleanup]);

  const finish = useCallback((dropped: boolean) => {
    setSummary({ duration: elapsedRef.current, members: membersRef.current.filter((m) => m.status === "joined").map(({ status: _s, speaking: _p, ...mate }) => mate), dropped });
    setMembers([]);
    setReconnecting(false);
    setPhase("ended");
    if (dropped) haptic.warning();
  }, []);

  const fail = useCallback(async (message: string) => {
    startAttempt.current += 1;
    startRequest.current?.abort();
    startRequest.current = null;
    leaving.current = true;
    await cleanup();
    setMembers([]);
    setPhase("lobby");
    setError(message);
    haptic.error();
  }, [cleanup]);

  const start = async () => {
    if (startInFlight.current) return;
    const { lead, others, chatId } = rosterRef.current;
    setError(null);
    if (!chatId) return setError("Open a chat with your mate first, then call.");
    startInFlight.current = true;
    const attempt = ++startAttempt.current;
    const isCurrent = () => startAttempt.current === attempt;
    const controller = new AbortController();
    startRequest.current = controller;
    try {
      if (!(await microphoneAllowed()) || !isCurrent()) return;
      haptic.medium();
      leaving.current = false;
      setPhase("connecting");
      setMembers([asMember(lead, "joining")]);
      setCaptions([]);
      setElapsed(0);
      setMuted(false);
      setSpeakerOn(true);
      const lk = liveKit();
      const { Room: LiveRoom, RoomEvent, DisconnectReason } = lk.client;
      const mateIds = others.filter((m) => invited.includes(m.id)).map((m) => m.id).slice(0, MAX_CALL_MATES - 1);
      const call = await runRequest<StartedCall>(getToken, "calls", {
        chatId,
        leadMateId: lead.id,
        mateIds,
        userName: firstName(session.user?.displayName),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }, controller.signal);
      if (!isCurrent()) return;

      await lk.AudioSession.configureAudio({ ios: { defaultOutput: "earpiece" }, android: { audioTypeOptions: lk.AndroidAudioTypePresets.communication } });
      if (!isCurrent()) return;
      await lk.AudioSession.startAudioSession();
      if (!isCurrent()) {
        await lk.AudioSession.stopAudioSession().catch(() => {});
        return;
      }

      const next = new LiveRoom({ adaptiveStream: false, dynacast: false });
      room.current = next;
      const finishFromAgent = (dropped: boolean) => {
        if (leaving.current) return;
        startAttempt.current += 1;
        startRequest.current?.abort();
        startRequest.current = null;
        leaving.current = true;
        finish(dropped);
        void cleanup();
      };
      next
        .on(RoomEvent.ParticipantConnected, (participant) => {
          if (!participant.isAgent) return;
          agent.current = participant;
          applyAgentState(participant);
        })
        .on(RoomEvent.ParticipantAttributesChanged, (_changed, participant) => {
          if (!participant.isAgent) return;
          if (participant.attributes?.["mates.ending"] === "true") {
            finishFromAgent(false);
            return;
          }
          applyAgentState(participant);
        })
        .on(RoomEvent.ParticipantDisconnected, (participant) => {
          if (participant.isAgent) finishFromAgent(participant.attributes?.["mates.ending"] !== "true");
        })
        .on(RoomEvent.Reconnecting, () => setReconnecting(true))
        .on(RoomEvent.Reconnected, () => setReconnecting(false))
        .on(RoomEvent.Disconnected, (reason) => {
          if (leaving.current) return;
          leaving.current = true;
          void cleanup();
          // Intentional agent hangups are handled above; other unexpected room closes count as dropped.
          finish(reason !== DisconnectReason.ROOM_DELETED && reason !== DisconnectReason.CLIENT_INITIATED);
        });
      next.registerTextStreamHandler("lk.transcription", async (reader, from) => {
        const id = reader.info.attributes?.["lk.segment_id"] ?? reader.info.id;
        const speakerId = agent.current?.attributes?.["mates.speaker"];
        const speaker = from.identity === next.localParticipant.identity ? "You" : (speakerId && mateById(speakerId)?.name) || rosterRef.current.lead.name;
        let text = "";
        for await (const chunk of reader) {
          text += chunk;
          const line = { id, speaker, text: text.trim() };
          setCaptions((list) => (list.some((c) => c.id === id) ? list.map((c) => (c.id === id ? line : c)) : [...list.slice(-2), line]));
        }
      });

      pickup.current = setTimeout(() => void fail("Your mate couldn’t pick up. Try again in a moment."), PICKUP_MS);
      await next.connect(call.serverUrl, call.token);
      if (!isCurrent()) {
        await next.disconnect().catch(() => {});
        return;
      }
      await next.localParticipant.setMicrophoneEnabled(true);
      if (!isCurrent()) {
        await next.localParticipant.setMicrophoneEnabled(false).catch(() => {});
        await next.disconnect().catch(() => {});
        return;
      }
      await lk.AudioSession.selectAudioOutput(outputFor(true)).catch(() => {});
      if (!isCurrent()) {
        await next.localParticipant.setMicrophoneEnabled(false).catch(() => {});
        await next.disconnect().catch(() => {});
        return;
      }
      // The agent may have joined before our listeners saw it.
      const already = [...next.remoteParticipants.values()].find((p) => p.isAgent);
      if (already) {
        agent.current = already;
        applyAgentState(already);
      }
      haptic.success();
    } catch (cause) {
      if (isCurrent()) await fail(cause instanceof Error ? cause.message : "Couldn’t start the call. Check your connection and try again.");
    } finally {
      if (startRequest.current === controller) startRequest.current = null;
      startInFlight.current = false;
    }
  };

  const end = () => {
    haptic.heavy();
    startAttempt.current += 1;
    startRequest.current?.abort();
    startRequest.current = null;
    leaving.current = true;
    finish(false);
    void cleanup();
  };
  const cancel = () => {
    startAttempt.current += 1;
    startRequest.current?.abort();
    startRequest.current = null;
    leaving.current = true;
    void cleanup();
    setMembers([]);
    setPhase("lobby");
  };
  const reset = () => { setSummary(null); setError(null); setPhase("lobby"); };

  /** Asks the agent to add or remove a mate; the attributes it publishes then update the tiles. */
  const changeRoster = async (method: "mates.invite" | "mates.remove", mateId: string) => {
    const current = room.current;
    const target = agent.current;
    if (!current || !target) return;
    try {
      const reply = JSON.parse(await current.localParticipant.performRpc({ destinationIdentity: target.identity, method, payload: JSON.stringify({ mateId }) })) as { ok: boolean; error?: string };
      if (!reply.ok) throw new Error(reply.error);
    } catch (cause) {
      if (method === "mates.invite") setMembers((list) => list.filter((m) => m.id !== mateId));
      Alert.alert(method === "mates.invite" ? "Couldn’t add that mate" : "Couldn’t remove that mate", cause instanceof Error && cause.message ? cause.message : "Try again in a moment.");
    }
  };

  const invite = (mate: BotMate) => {
    setMembers((list) => (list.some((m) => m.id === mate.id) ? list : [...list, asMember(mate, "joining")]));
    void changeRoster("mates.invite", mate.id);
  };
  const remove = (id: string) => {
    if (id === rosterRef.current.lead.id) return;
    void changeRoster("mates.remove", id);
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    void room.current?.localParticipant.setMicrophoneEnabled(!next).catch(() => setMuted(!next));
  };
  const toggleSpeaker = () => {
    const next = !speakerOn;
    setSpeakerOn(next);
    if (loaded) void loaded.AudioSession.selectAudioOutput(outputFor(next)).catch(() => setSpeakerOn(!next));
  };

  useEffect(() => {
    if (phase !== "live") return;
    const clock = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(clock);
  }, [phase]);

  return {
    lead: rosterRef.current.lead,
    available: rosterRef.current.others,
    groupMembers: rosterRef.current.group,
    preview: false,
    setInvited,
    phase, invited, members, muted, speakerOn, captionsOn, captions, elapsed, summary, reconnecting, error,
    toggleInvite: (id: string) => {
      haptic.selection();
      setInvited((list) => (list.includes(id) ? list.filter((x) => x !== id) : list.length >= MAX_CALL_MATES - 1 ? list : [...list, id]));
    },
    start: () => void start(),
    cancel, end, reset, invite, remove, toggleMute, toggleSpeaker,
    toggleCaptions: () => setCaptionsOn((v) => !v),
  };
}
