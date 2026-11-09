import { useAuth } from "@clerk/expo";
import { useAuiState } from "@assistant-ui/react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { createApiClient } from "../data/api";

export type Gradient = [string, string, string];
/** `shape` is the mascot silhouette (see SHAPE_NAMES in @muse-clone/mascot); older payloads may lack it. */
export type MateSummary = { id: string; name: string; role: string; color: string; shape?: string; gradient: Gradient };
export type Mate = MateSummary & { roleDescription: string; isDefault: boolean; chatId: string };
export type Group = { chatId: string; name: string; mateIds: string[]; leaderMateId: string | null };
export type Presets = { palette: { key: string; gradient: Gradient }[]; roles: { key: string; label: string; brief: string }[]; shapes?: string[] };
export type ChatSummary = {
  id: string;
  title: string;
  kind: "legacy" | "mate" | "group" | "routine";
  updatedAt: string;
  mate: MateSummary | null;
  members: MateSummary[];
  leaderMateId: string | null;
  preview: { from: string; text: string; at: string } | null;
};
/** Leave `shape` out to let the server pick one at random. */
export type MateInput = { name: string; role: string; roleDescription: string; color: string; shape?: string };
export type GroupInput = { name: string; mateIds: string[]; leaderMateId?: string };

/** Cooper's original look; used until mates load. */
export const DEFAULT_GRADIENT: Gradient = ["#e5c59e", "#d27e41", "#9A3412"];

async function read<T>(response: { ok: boolean; json(): Promise<unknown> }, fallback: string): Promise<T> {
  const body = (await response.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (!response.ok || !body) throw new Error(body?.error?.message ?? fallback);
  return body;
}

function useApi() {
  const { getToken } = useAuth();
  return useMemo(() => createApiClient(getToken), [getToken]);
}

/** Mates, groups and the presets for creating them, all from the server. */
export function useMates() {
  const api = useApi();
  const { userId } = useAuth();
  return useQuery({
    queryKey: ["mates", userId],
    queryFn: async () => read<{ mates: Mate[]; groups: Group[]; presets: Presets }>(await api.v1.mates.$get(), "Couldn’t load your mates."),
    staleTime: 60_000,
  });
}

/** Every chat with who it's with and its newest message, for the sidebar and the header. */
export function useChats() {
  const api = useApi();
  const { userId } = useAuth();
  return useQuery({
    queryKey: ["chats", userId],
    queryFn: async () => (await read<{ chats: ChatSummary[] }>(await api.v1.chats.$get(), "Couldn’t load your chats.")).chats,
    staleTime: 15_000,
  });
}

/** Who the open chat is with, from the sidebar's data. */
export function useCurrentChat() {
  const remoteId = useAuiState((state) => state.threadListItem.remoteId);
  const chats = useChats();
  return useMemo(() => chats.data?.find((chat) => chat.id === remoteId) ?? null, [chats.data, remoteId]);
}

export function useMateActions() {
  const api = useApi();
  const client = useQueryClient();
  const refresh = () => Promise.all([client.invalidateQueries({ queryKey: ["mates"] }), client.invalidateQueries({ queryKey: ["chats"] })]);
  const after = <T,>(work: () => Promise<T>) => async () => {
    const result = await work();
    await refresh();
    return result;
  };
  return {
    createMate: useMutation({
      mutationFn: (input: MateInput) => after(async () => (await read<{ mate: Mate }>(await api.v1.mates.$post({ json: input as never }), "Couldn’t create your mate.")).mate)(),
    }),
    updateMate: useMutation({
      mutationFn: ({ id, ...input }: Partial<MateInput> & { id: string }) =>
        after(async () => (await read<{ mate: Mate }>(await api.v1.mates[":id"].$patch({ param: { id }, json: input as never }), "Couldn’t save your mate.")).mate)(),
    }),
    deleteMate: useMutation({
      mutationFn: (id: string) => after(async () => read(await api.v1.mates[":id"].$delete({ param: { id } }), "Couldn’t remove this mate."))(),
    }),
    createGroup: useMutation({
      mutationFn: (input: GroupInput) => after(async () => (await read<{ group: Group }>(await api.v1.groups.$post({ json: input }), "Couldn’t create the group.")).group)(),
    }),
    updateGroup: useMutation({
      mutationFn: ({ chatId, ...input }: Partial<GroupInput> & { chatId: string }) =>
        after(async () => (await read<{ group: Group }>(await api.v1.groups[":chatId"].$patch({ param: { chatId }, json: input }), "Couldn’t save the group.")).group)(),
    }),
    deleteGroup: useMutation({
      mutationFn: (chatId: string) => after(async () => read(await api.v1.groups[":chatId"].$delete({ param: { chatId } }), "Couldn’t delete the group."))(),
    }),
    refresh,
  };
}
