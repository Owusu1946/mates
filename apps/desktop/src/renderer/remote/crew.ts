import { useAuth } from "@clerk/electron/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Mate } from "../data/sampleCrew.ts";
import { roleInput, toCrew, type ApiChatsBody, type ApiMate, type ApiMatesBody, type Crew } from "../data/toDesktop.logic.ts";
import { isUnread } from "../data/unread.logic.ts";
import { read, useApi } from "../lib/api.ts";
import { markChatSeen, useSeen } from "./seen.ts";

export const matesKey = (userId: string | null | undefined) => ["mates", userId] as const;
export const chatsKey = (userId: string | null | undefined) => ["chats", userId] as const;

export type CrewState = {
  crew: Crew | null;
  /** True only before anything is known: no saved copy and the first load still running. */
  loading: boolean;
  error: string | null;
  unread: Record<string, boolean>;
  markSeen: (chatId: string) => void;
  /** Loads again now (Try again, or after something changed elsewhere). */
  refresh: () => void;
};

/**
 * Your crew as the sidebar shows it, the phone's way (apps/mobile/src/mates/data.ts): mates and
 * groups (stale after a minute) and the chat list with previews (after 15 seconds). Both come
 * from the saved copy first, then refresh on focus. The chat list also refreshes every 30 seconds
 * while the window is up, since the desktop gets no push.
 */
export function useCrew(): CrewState {
  const { userId } = useAuth();
  const api = useApi();
  const client = useQueryClient();
  const mates = useQuery({
    queryKey: matesKey(userId),
    queryFn: async () => read<ApiMatesBody>(await api.v1.mates.$get(), "Couldn’t load your mates."),
    staleTime: 60_000,
    enabled: Boolean(userId),
  });
  const chats = useQuery({
    queryKey: chatsKey(userId),
    queryFn: async () => read<ApiChatsBody>(await api.v1.chats.$get(), "Couldn’t load your chats."),
    staleTime: 15_000,
    refetchInterval: 30_000,
    enabled: Boolean(userId),
  });
  const seen = useSeen(userId ?? "");
  const crew = mates.data ? toCrew(mates.data, chats.data, new Date()) : null;
  const unread = Object.fromEntries((crew ? [...crew.chats, ...crew.earlier] : []).map((chat) => [chat.id, isUnread(chat, seen)]));
  return {
    crew,
    loading: !mates.data && mates.isPending,
    error: !mates.data && mates.error ? mates.error.message : null,
    unread,
    markSeen: (chatId) => userId && markChatSeen(userId, chatId),
    refresh: () => void client.invalidateQueries({ queryKey: ["mates"] }).then(() => client.invalidateQueries({ queryKey: ["chats"] })),
  };
}

export type MateInput = { name: string; role: string; shape: Mate["shape"]; color: Mate["color"] };
export type GroupInput = { title: string; mateIds: string[]; leadId?: string };

/**
 * Making and changing mates and groups through the API (POST and PATCH /v1/mates and
 * /v1/groups). Each resolves to an error message for the dialog, or null once saved; edits show at
 * once and go back if the API says no. Afterwards the crew and chat list reload, as on the phone.
 */
export function useCrewActions() {
  const { userId } = useAuth();
  const api = useApi();
  const client = useQueryClient();
  const roles = () => client.getQueryData<ApiMatesBody>(matesKey(userId))?.presets.roles ?? [];
  const reload = () => Promise.all([client.invalidateQueries({ queryKey: ["mates"] }), client.invalidateQueries({ queryKey: ["chats"] })]);
  const attempt = async <T,>(work: () => Promise<T>): Promise<{ value: T; error: null } | { value: null; error: string }> => {
    try {
      return { value: await work(), error: null };
    } catch (cause) {
      return { value: null, error: cause instanceof Error ? cause.message : "Something went wrong. Please try again." };
    }
  };

  /** A new mate; resolves with its chat id to open, or the API's reason it couldn't be made. */
  async function createMate(input: MateInput) {
    const result = await attempt(async () => {
      const body = await read<{ mate: ApiMate }>(await api.v1.mates.$post({ json: { name: input.name, ...roleInput(input.role, roles()), color: input.color, shape: input.shape } as never }), "Couldn’t make that mate.");
      return body.mate.chatId;
    });
    await reload();
    return result;
  }

  async function updateMate(id: string, input: MateInput) {
    const key = matesKey(userId);
    const before = client.getQueryData<ApiMatesBody>(key);
    const role = roleInput(input.role, roles());
    if (before) client.setQueryData<ApiMatesBody>(key, { ...before, mates: before.mates.map((mate) => (mate.id === id ? { ...mate, name: input.name, color: input.color, shape: input.shape, ...role } : mate)) });
    const result = await attempt(async () => read(await api.v1.mates[":id"].$patch({ param: { id }, json: { name: input.name, ...role, color: input.color, shape: input.shape } as never }), "Couldn’t save that mate."));
    if (result.error && before) client.setQueryData(key, before);
    await reload();
    return result.error;
  }

  async function createGroup(input: GroupInput) {
    const result = await attempt(async () => {
      const body = await read<{ group: { chatId: string } }>(await api.v1.groups.$post({ json: { name: input.title, mateIds: input.mateIds, leaderMateId: input.leadId ?? input.mateIds[0] } }), "Couldn’t make that group.");
      return body.group.chatId;
    });
    await reload();
    return result;
  }

  async function updateGroup(chatId: string, input: GroupInput) {
    const key = matesKey(userId);
    const before = client.getQueryData<ApiMatesBody>(key);
    if (before) client.setQueryData<ApiMatesBody>(key, { ...before, groups: before.groups.map((group) => (group.chatId === chatId ? { ...group, name: input.title, mateIds: input.mateIds, leaderMateId: input.leadId ?? group.leaderMateId } : group)) });
    const result = await attempt(async () => read(await api.v1.groups[":chatId"].$patch({ param: { chatId }, json: { name: input.title, mateIds: input.mateIds, ...(input.leadId ? { leaderMateId: input.leadId } : {}) } }), "Couldn’t save that group."));
    if (result.error && before) client.setQueryData(key, before);
    await reload();
    return result.error;
  }

  return { createMate, updateMate, createGroup, updateGroup };
}
