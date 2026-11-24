/**
 * A voice call with your mates, as on the phone (apps/mobile/src/call/call-types.ts): connecting,
 * live, ended. While live, people take turns: each turn is a caption, and whoever's talking shows
 * it on their face. UI only: the lines come from the sample crew until the call reaches LiveKit.
 */

export type CallPhase = "connecting" | "live" | "ended";
export type Caption = { id: number; speaker: string; text: string };

export type CallState = {
  phase: CallPhase;
  /** The chat the call started from, where its summary goes. */
  chatId: string;
  memberIds: string[];
  startedAt: number;
  endedAt: number | null;
  /** Who's talking now: a mate's id, "me", or null for a pause. */
  speaker: string | null;
  captions: Caption[];
  turn: number;
  muted: boolean;
  captionsOn: boolean;
};

export type CallAction =
  | { type: "start"; chatId: string; memberIds: string[]; at: number }
  | { type: "connected"; at: number }
  | { type: "turn"; lines: Record<string, string[]>; you: string[] }
  | { type: "mute" }
  | { type: "captions" }
  | { type: "invite"; mateId: string }
  | { type: "end"; at: number }
  | { type: "close" };

/** Captions kept on screen: the latest few, so the panel never grows. */
export const CAPTION_LIMIT = 4;

export function startCall(chatId: string, memberIds: string[], at: number): CallState {
  return { phase: "connecting", chatId, memberIds, startedAt: at, endedAt: null, speaker: null, captions: [], turn: 0, muted: false, captionsOn: true };
}

/**
 * Who talks on turn `n`: you every third turn (unless muted), the mates in order otherwise, so a
 * group call goes round the room.
 */
export function speakerFor(turn: number, memberIds: string[], muted: boolean): string {
  if (!muted && turn % 3 === 2) return "me";
  const mateTurns = turn - Math.floor((turn + 1) / 3) * (muted ? 0 : 1);
  return memberIds[mateTurns % memberIds.length]!;
}

export function callReducer(state: CallState | null, action: CallAction): CallState | null {
  if (action.type === "start") return startCall(action.chatId, action.memberIds, action.at);
  if (!state) return state;
  switch (action.type) {
    case "connected":
      return state.phase === "connecting" ? { ...state, phase: "live", startedAt: action.at } : state;
    case "turn": {
      if (state.phase !== "live") return state;
      const speaker = speakerFor(state.turn, state.memberIds, state.muted);
      const pool = speaker === "me" ? action.you : (action.lines[speaker] ?? ["Got it."]);
      const text = pool[Math.floor(state.turn / Math.max(1, state.memberIds.length)) % pool.length]!;
      const captions = [...state.captions, { id: state.turn, speaker, text }].slice(-CAPTION_LIMIT);
      return { ...state, speaker, captions, turn: state.turn + 1 };
    }
    case "mute":
      return { ...state, muted: !state.muted, speaker: state.speaker === "me" ? null : state.speaker };
    case "captions":
      return { ...state, captionsOn: !state.captionsOn };
    case "invite":
      return state.memberIds.includes(action.mateId) || state.phase === "ended" ? state : { ...state, memberIds: [...state.memberIds, action.mateId] };
    case "end":
      return state.phase === "ended" ? state : { ...state, phase: "ended", endedAt: action.at, speaker: null };
    case "close":
      return null;
  }
}

/** 0:07 · 12:40 · 1:02:05 */
export function formatCallTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}
