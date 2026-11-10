// What every call session gives the screens, whether it's the real LiveKit call or the Expo Go demo.

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
  id: string | number;
  speaker: string;
  text: string;
}

/** `chatId` is where the call's tasks and summary go: the open chat, else the lead's own chat. */
export type CallRoster = { lead: BotMate; others: BotMate[]; group: string[]; chatId?: string };

export type CallSummary = { duration: number; members: BotMate[]; dropped?: boolean };

export interface CallSession {
  lead: BotMate;
  available: BotMate[];
  groupMembers: string[];
  /** True when this is the Expo Go demo rather than a real call. */
  preview: boolean;
  phase: CallPhase;
  invited: string[];
  members: CallMember[];
  muted: boolean;
  speakerOn: boolean;
  captionsOn: boolean;
  captions: Caption[];
  elapsed: number;
  summary: CallSummary | null;
  reconnecting: boolean;
  /** Why the last start failed, shown in the lobby. */
  error: string | null;
  setInvited: (ids: string[]) => void;
  toggleInvite: (id: string) => void;
  start: () => void;
  cancel: () => void;
  end: () => void;
  reset: () => void;
  invite: (mate: BotMate) => void;
  remove: (id: string) => void;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  toggleCaptions: () => void;
}

export const asMember = (mate: BotMate, status: MateStatus): CallMember => ({ ...mate, status, speaking: false });
