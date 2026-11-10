import Constants, { ExecutionEnvironment } from "expo-constants";
import { createContext, createElement, useContext, useMemo, type PropsWithChildren } from "react";
import { NativeModules } from "react-native";
import type { PolygonState } from "../components/polygon-avatar/polygon-avatar-core";
import { DEFAULT_GRADIENT } from "../components/polygon-avatar/polygon-avatar-core";
import { useCurrentChat, useMates } from "../mates/data";
import { useLiveCallSession } from "./call-live";
import { useSimCallSession } from "./call-sim";
import type { BotMate, CallMember, CallRoster, CallSession } from "./call-types";

export type { BotMate, CallMember, CallPhase, Caption, CallRoster } from "./call-types";

// The screens talk to one session interface. Real calls run on LiveKit, which needs the native
// module in the Mates app build; Expo Go gets the demo session instead.

/** Lines the Expo Go demo speaks per role; real calls use the mates' own words. */
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

/** Real calls need LiveKit's native module: present in the app build, absent in Expo Go. */
const liveCalls = Constants.executionEnvironment !== ExecutionEnvironment.StoreClient && NativeModules.LivekitReactNativeModule != null;
// Chosen once, so the provider always calls the same hook.
const useCallSession: (roster: CallRoster) => CallSession = liveCalls ? useLiveCallSession : useSimCallSession;

// Lives above the stack so a minimized call keeps running while the user browses.
const CallContext = createContext<CallSession | null>(null);

/** The open chat decides the call: its mate leads (a group's leader), everyone else can join. */
function useRoster(): CallRoster {
  const mates = useMates();
  const chat = useCurrentChat();
  return useMemo(() => {
    const list = mates.data?.mates ?? [];
    const all = list.map(toCallMate);
    if (!all.length) return FALLBACK_ROSTER;
    const cooperId = list.find((m) => m.isDefault)?.id;
    const leadId = chat?.kind === "mate" ? chat.mate?.id : chat?.kind === "group" ? chat.leaderMateId ?? chat.members[0]?.id : cooperId;
    const lead = all.find((m) => m.id === leadId) ?? all.find((m) => m.id === cooperId) ?? all[0]!;
    const group = chat?.kind === "group" ? chat.members.map((m) => m.id).filter((id) => id !== lead.id) : [];
    // A routine's chat isn't a conversation; its calls go to the lead's own chat.
    const chatId = chat && chat.kind !== "routine" ? chat.id : list.find((m) => m.id === lead.id)?.chatId;
    return { lead, others: all.filter((m) => m.id !== lead.id), group, chatId };
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
