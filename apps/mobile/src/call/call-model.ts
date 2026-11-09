import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import type { PolygonState } from "../components/polygon-avatar/polygon-avatar-core";
import { DEFAULT_GRADIENT } from "../components/polygon-avatar/polygon-avatar-core";
import { haptic } from "../haptics";
import { useCurrentChat, useMates } from "../mates/data";

// UI-only call flow. Audio, transport and agent turns are simulated until a
// realtime voice backend exists; swap useCallSession's internals, not the screens.

export type CallPhase = "lobby" | "connecting" | "live" | "ended";
export type MateStatus = "joining" | "joined";

export interface BotMate {
  id: string;
  name: string;
  role: string;
  gradient: [string, string, string];
  shape?: string;
  lines: string[];
}

export interface CallMember extends BotMate {
  status: MateStatus;
  speaking: boolean;
}

export interface Caption {
  id: number;
  speaker: string;
  text: string;
}

/** Simulated lines per role until real voice exists; the speech is placeholder, the cast is real. */
const ROLE_LINES: Record<string, string[]> = {
  companion: ["Hey! I'm here. What should we work on?", "Got it. I'll pull the details together while we talk."],
  research: ["I found three good sources on that.", "Prices changed this morning, I'll flag it."],
  planning: ["Thursday afternoon is free for that.", "I'd split it into two smaller steps."],
  money: ["That fits the budget with some room left.", "I'd hold off until the sale on Friday."],
  creative: ["Here's a warmer direction for it.", "I can sketch three variations."],
  health: ["A short walk after lunch would fit nicely.", "Let's keep this week's goal realistic."],
  study: ["Let's go through it one step at a time.", "Want a quick quiz on that?"],
};

export function toCallMate(mate: { id: string; name: string; role: string; gradient: [string, string, string]; shape?: string }): BotMate {
  return { id: mate.id, name: mate.name, role: mate.role, gradient: mate.gradient, shape: mate.shape, lines: ROLE_LINES[mate.role] ?? ROLE_LINES.companion! };
}

export type CallRoster = { lead: BotMate; others: BotMate[]; group: string[] };
/** Until mates load, a call is with the lead mate in its original look. */
const FALLBACK_ROSTER: CallRoster = { lead: toCallMate({ id: "lead", name: "Your mate", role: "companion", gradient: DEFAULT_GRADIENT }), others: [], group: [] };

export function avatarState(member: CallMember, listening: boolean): PolygonState {
  if (member.status === "joining") return "waking";
  if (member.speaking) return "humming";
  return listening ? "listening" : "idle";
}

export function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const asMember = (mate: BotMate, status: MateStatus): CallMember => ({ ...mate, status, speaking: false });

function useCallSession(roster: CallRoster) {
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
  const [summary, setSummary] = useState<{ duration: number; members: BotMate[] } | null>(null);
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
    setInvited,
    phase, invited, members, muted, speakerOn, captionsOn, captions, elapsed, summary,
    toggleInvite, start, cancel, end, reset, invite, remove,
    toggleMute: () => { setMuted(v => !v); },
    toggleSpeaker: () => { setSpeakerOn(v => !v); },
    toggleCaptions: () => { setCaptionsOn(v => !v); },
  };
}

// Lives above the stack so a minimized call keeps running while the user browses.
type CallSession = ReturnType<typeof useCallSession>;
const CallContext = createContext<CallSession | null>(null);

/** The open chat decides the call: its mate leads (a group's leader), everyone else can join. */
function useRoster(): CallRoster {
  const mates = useMates();
  const chat = useCurrentChat();
  return useMemo(() => {
    const all = (mates.data?.mates ?? []).map(toCallMate);
    if (!all.length) return FALLBACK_ROSTER;
    const cooperId = mates.data?.mates.find((m) => m.isDefault)?.id;
    const leadId = chat?.kind === "mate" ? chat.mate?.id : chat?.kind === "group" ? chat.leaderMateId ?? chat.members[0]?.id : cooperId;
    const lead = all.find((m) => m.id === leadId) ?? all.find((m) => m.id === cooperId) ?? all[0]!;
    const group = chat?.kind === "group" ? chat.members.map((m) => m.id).filter((id) => id !== lead.id) : [];
    return { lead, others: all.filter((m) => m.id !== lead.id), group };
  }, [chat, mates.data]);
}

export function CallProvider({ children }: PropsWithChildren) {
  return createElement(CallContext.Provider, { value: useCallSession(useRoster()) }, children);
}

export function useCall() {
  const value = useContext(CallContext);
  if (!value) throw new Error("useCall must be used inside CallProvider");
  return value;
}
