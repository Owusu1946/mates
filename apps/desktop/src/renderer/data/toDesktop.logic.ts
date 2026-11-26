import type { ShapeName } from "@muse-clone/mascot";
import type { MateColor } from "../theme/matePalette.ts";
import type { Chat, Mate } from "./sampleCrew.ts";

/**
 * The API's crew (GET /v1/mates, GET /v1/chats; apps/api/src/mates.ts) in the shapes the desktop
 * draws. Pure, so the rules are tested without React or the network.
 */

export type ApiRolePreset = { key: string; label: string; brief: string };
export type ApiMate = { id: string; name: string; role: string; roleDescription: string; color: string; shape: string; isDefault: boolean; setupAt: string | null; chatId: string };
export type ApiGroup = { chatId: string; name: string; mateIds: string[]; leaderMateId: string | null };
export type ApiMatesBody = { presets: { roles: ApiRolePreset[] }; mates: ApiMate[]; groups: ApiGroup[] };
export type ApiPreview = { from: string; text: string; at: string };
export type ApiChat = { id: string; title: string; kind: "legacy" | "mate" | "group" | "routine"; status: "regular" | "archived"; mateId: string | null; leaderMateId: string | null; updatedAt: string; preview: ApiPreview | null };
export type ApiChatsBody = { chats: ApiChat[] };

/** A chat as the sidebar draws it, plus when it last changed, for sorting and unread. */
export type CrewChat = Chat & { at: string | null; lastFrom: string | null };

export type Crew = {
  mates: Mate[];
  /** The lead mate: the one made at sign-up, whose chat opens first. */
  leadId: string | null;
  /** Mate and group chats, the newest first. */
  chats: CrewChat[];
  /** Older chats from before mates (the phone folds them under "Earlier chats"). */
  earlier: CrewChat[];
};

const COLORS: readonly string[] = ["amber", "teal", "blue", "green", "purple", "rose", "slate", "sunset"];
const SHAPES: readonly string[] = ["hexagon", "circle", "triangle", "oval", "squircle", "pill", "cloud", "teardrop", "pebble", "star"];

/** What a mate helps with: its preset's label, or for a custom role the person's own words. */
export function roleLabel(mate: Pick<ApiMate, "role" | "roleDescription">, roles: ApiRolePreset[]): string {
  if (mate.role === "custom") return mate.roleDescription.split("\n")[0]!.trim().slice(0, 40) || "Custom";
  return roles.find((role) => role.key === mate.role)?.label ?? mate.role;
}

/**
 * The desktop's free-text "What they help with" as the API's role: a preset when the words are
 * its label, otherwise a custom role described in those words.
 */
export function roleInput(text: string, roles: ApiRolePreset[]): { role: string; roleDescription: string } {
  const words = text.trim();
  const preset = roles.find((role) => role.key !== "custom" && role.label.toLowerCase() === words.toLowerCase());
  return preset ? { role: preset.key, roleDescription: "" } : { role: "custom", roleDescription: words };
}

export function toMate(mate: ApiMate, roles: ApiRolePreset[]): Mate {
  return {
    id: mate.id,
    name: mate.name,
    role: roleLabel(mate, roles),
    color: (COLORS.includes(mate.color) ? mate.color : "teal") as MateColor,
    shape: (SHAPES.includes(mate.shape) ? mate.shape : "hexagon") as ShapeName,
    status: "idle",
  };
}

/** The line under a chat's name: who said it in a group, "You:" when it was you. */
export function previewLine(preview: ApiPreview | null, kind: Chat["kind"]): string {
  if (!preview) return "";
  if (preview.from === "you") return `You: ${preview.text}`;
  return kind === "group" ? `${preview.from}: ${preview.text}` : preview.text;
}

/** When a chat last moved, as the sidebar shows it: the time today, the day this week, else the date. */
export function timeLabel(iso: string | null, now: Date): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (at.getTime() >= startOfToday) return at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (at.getTime() >= startOfToday - 6 * 24 * 60 * 60_000) return at.toLocaleDateString(undefined, { weekday: "short" });
  return at.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

const newest = (a: CrewChat, b: CrewChat) => Date.parse(b.at ?? "") - Date.parse(a.at ?? "") || a.title.localeCompare(b.title);

/**
 * The sidebar's crew. Every mate has a chat (mate_<id>) even before its first message, every group
 * has one, and the chat list adds what was said last. Older kinds fold away, and archived chats
 * don't show.
 */
export function toCrew(matesBody: ApiMatesBody, chatsBody: ApiChatsBody | undefined, now: Date): Crew {
  const roles = matesBody.presets.roles;
  const mates = matesBody.mates.map((mate) => toMate(mate, roles));
  const lead = matesBody.mates.find((mate) => mate.isDefault) ?? matesBody.mates[0];
  const leadId = lead?.id ?? null;
  const rows = new Map((chatsBody?.chats ?? []).map((chat) => [chat.id, chat]));
  const crewChat = (base: Omit<CrewChat, "preview" | "time" | "at" | "lastFrom">, row: ApiChat | undefined): CrewChat => {
    const at = row?.preview?.at ?? row?.updatedAt ?? null;
    return { ...base, preview: previewLine(row?.preview ?? null, base.kind), time: timeLabel(at, now), at, lastFrom: row?.preview?.from ?? null };
  };

  const mateChats = matesBody.mates.map((mate) => crewChat({ id: mate.chatId, kind: "mate", title: mate.name, mateIds: [mate.id], leadId: mate.id }, rows.get(mate.chatId)));
  const groupChats = matesBody.groups.flatMap((group) => {
    const mateIds = group.mateIds.filter((id) => mates.some((mate) => mate.id === id));
    if (!mateIds.length || rows.get(group.chatId)?.status === "archived") return [];
    const lead = group.leaderMateId && mateIds.includes(group.leaderMateId) ? group.leaderMateId : mateIds[0]!;
    return [crewChat({ id: group.chatId, kind: "group", title: group.name, mateIds, leadId: lead }, rows.get(group.chatId))];
  });
  const earlier = leadId
    ? [...rows.values()]
        .filter((row) => (row.kind === "legacy" || row.kind === "routine") && row.status !== "archived")
        .map((row) => crewChat({ id: row.id, kind: "thread", title: row.title || "Chat", mateIds: [leadId], leadId }, row))
    : [];
  return { mates, leadId, chats: [...mateChats, ...groupChats].sort(newest), earlier: earlier.sort(newest) };
}
