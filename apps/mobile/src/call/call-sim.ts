import { useCallback, useEffect, useRef, useState } from "react";
import { haptic } from "../haptics";
import { asMember, type BotMate, type CallMember, type CallPhase, type CallRoster, type CallSession, type CallSummary, type Caption } from "./call-types";

// The Expo Go demo: real calls need LiveKit's native module, which only the Mates app build has.
// Turns, captions and joins are simulated so the screens can still be reviewed.

export function useSimCallSession(roster: CallRoster): CallSession {
  const [phase, setPhase] = useState<CallPhase>("lobby");
  // A call keeps the cast it started with, even if the open chat changes underneath it.
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
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const turn = useRef(0);
  const membersRef = useRef(members);
  membersRef.current = members;

  const later = useCallback((ms: number, fn: () => void) => {
    const id = setTimeout(() => { timers.current.delete(id); fn(); }, ms);
    timers.current.add(id);
  }, []);
  const clearTimers = useCallback(() => {
    for (const id of timers.current) clearTimeout(id);
    timers.current.clear();
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  const join = useCallback((mate: BotMate, delay: number) => {
    setMembers(list => list.some(m => m.id === mate.id) ? list : [...list, asMember(mate, "joining")]);
    later(delay, () => {
      setMembers(list => list.map(m => m.id === mate.id ? { ...m, status: "joined" } : m));
      haptic.light();
    });
  }, [later]);

  const toggleInvite = (id: string) => {
    haptic.selection();
    setInvited(list => list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  };

  const start = () => {
    haptic.medium();
    setPhase("connecting");
    setMembers([asMember(rosterRef.current.lead, "joining")]);
    setCaptions([]);
    setElapsed(0);
    later(1800, () => {
      setPhase("live");
      haptic.success();
      setMembers(list => list.map(m => ({ ...m, status: "joined" })));
      rosterRef.current.others.filter(m => invited.includes(m.id)).forEach((mate, i) => join(mate, 1200 + i * 900));
    });
  };

  const invite = (mate: BotMate) => { join(mate, 1400); };
  const remove = (id: string) => {
    setMembers(list => list.filter(m => m.id !== id || m.id === rosterRef.current.lead.id));
  };

  const end = () => {
    haptic.heavy();
    clearTimers();
    setSummary({ duration: elapsed, members: membersRef.current.map(({ status: _s, speaking: _p, ...mate }) => mate) });
    setMembers([]);
    setPhase("ended");
  };
  const cancel = () => { clearTimers(); setMembers([]); setPhase("lobby"); };
  const reset = () => { setSummary(null); setPhase("lobby"); };

  useEffect(() => {
    if (phase !== "live") return;
    const clock = setInterval(() => setElapsed(s => s + 1), 1000);
    // Rotate a simulated speaker so tiles, avatar states and captions can be reviewed.
    const talk = setInterval(() => {
      const ready = membersRef.current.filter(m => m.status === "joined");
      if (!ready.length) return;
      const speaker = ready[turn.current % ready.length]!;
      const line = speaker.lines[Math.floor(turn.current / ready.length) % speaker.lines.length]!;
      turn.current++;
      setMembers(list => list.map(m => ({ ...m, speaking: m.id === speaker.id })));
      setCaptions(list => [...list.slice(-2), { id: Date.now(), speaker: speaker.name, text: line }]);
      later(2400, () => setMembers(list => list.map(m => m.id === speaker.id ? { ...m, speaking: false } : m)));
    }, 3600);
    return () => { clearInterval(clock); clearInterval(talk); };
  }, [phase, later]);

  return {
    lead: rosterRef.current.lead,
    available: rosterRef.current.others,
    groupMembers: rosterRef.current.group,
    preview: true,
    reconnecting: false,
    error: null,
    setInvited,
    phase, invited, members, muted, speakerOn, captionsOn, captions, elapsed, summary,
    toggleInvite, start, cancel, end, reset, invite, remove,
    toggleMute: () => { setMuted(v => !v); },
    toggleSpeaker: () => { setSpeakerOn(v => !v); },
    toggleCaptions: () => { setCaptionsOn(v => !v); },
  };
}
