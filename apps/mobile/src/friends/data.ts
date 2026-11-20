import { useAuth } from "@clerk/expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { createApiClient } from "../data/api";

/** What a friend's mate may do with yours without asking you first. */
export type FriendPermissions = { freeTimes: boolean; messages: boolean; answers: boolean };
export type Friend = { userId: string; name: string; permissions: FriendPermissions; since: string };
export type FriendsData = {
  friends: Friend[];
  requests: { code: string; name: string; at: string }[];
  sent: { code: string; name: string; at: string }[];
};
export type InvitePreview = { name: string; state: "open" | "expired" | "used" | "own" | "friends" | "unavailable" };
export type EmailInviteStatus = "sent" | "not_found" | "already_friends" | "self" | "already_sent";

async function read<T>(response: { ok: boolean; json(): Promise<unknown> }, fallback: string): Promise<T> {
  const body = (await response.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (!response.ok || !body) throw new Error(body?.error?.message ?? fallback);
  return body;
}

function useApi() {
  const { getToken } = useAuth();
  return useMemo(() => createApiClient(getToken), [getToken]);
}

/** Warm colours for friends' initials, from the mates' own palette, picked by id so they never change. */
const AVATAR = ["#d27e41", "#57694D", "#BD8873", "#6366f1", "#9A3412", "#46653D"];
export const friendColour = (userId: string) => AVATAR[[...userId].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % AVATAR.length]!;

export function useFriends() {
  const api = useApi();
  const { userId } = useAuth();
  return useQuery({
    queryKey: ["friends", userId],
    enabled: !!userId,
    queryFn: async () => read<FriendsData>(await api.v1.friends.$get(), "Couldn’t load your friends."),
  });
}

export function useInvitePreview(code: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: ["friend-invite", code],
    enabled: !!code,
    retry: false,
    queryFn: async () => read<InvitePreview>(await api.v1.friends.invites[":code"].$get({ param: { code: code! } }), "This invite link doesn’t work."),
  });
}

/** Every change to friends, each refreshing the list when it lands. */
export function useFriendActions() {
  const api = useApi();
  const { userId } = useAuth();
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: ["friends", userId] });
  const settle = { onSettled: refresh };
  return {
    createLink: useMutation({
      mutationFn: async () => read<{ code: string; url: string; message: string }>(await api.v1.friends.invites.$post(), "Couldn’t make an invite."),
      ...settle,
    }),
    inviteByEmail: useMutation({
      mutationFn: async (email: string) => (await read<{ status: EmailInviteStatus }>(await api.v1.friends.invites.email.$post({ json: { email } }), "Couldn’t send that.")).status,
      ...settle,
    }),
    accept: useMutation({
      mutationFn: async (code: string) => read<{ friendUserId: string; name: string }>(await api.v1.friends.invites[":code"].accept.$post({ param: { code } }), "Couldn’t connect."),
      ...settle,
    }),
    decline: useMutation({
      mutationFn: async (code: string) => read<{ ok: true }>(await api.v1.friends.invites[":code"].decline.$post({ param: { code } }), "Couldn’t do that."),
      ...settle,
    }),
    setPermissions: useMutation({
      mutationFn: async ({ friend, change }: { friend: string; change: Partial<FriendPermissions> }) =>
        read<{ permissions: FriendPermissions }>(await api.v1.friends[":userId"].$patch({ param: { userId: friend }, json: { permissions: change } }), "Couldn’t save that."),
      // Flip it on screen straight away; the server catches up.
      onMutate: ({ friend, change }) => {
        client.setQueryData<FriendsData>(["friends", userId], (data) => data && { ...data, friends: data.friends.map((f) => (f.userId === friend ? { ...f, permissions: { ...f.permissions, ...change } } : f)) });
      },
      ...settle,
    }),
    remove: useMutation({
      mutationFn: async (friend: string) => read<{ ok: true }>(await api.v1.friends[":userId"].$delete({ param: { userId: friend } }), "Couldn’t remove them."),
      ...settle,
    }),
    block: useMutation({
      mutationFn: async (friend: string) => read<{ ok: true }>(await api.v1.friends[":userId"].block.$post({ param: { userId: friend } }), "Couldn’t block them."),
      ...settle,
    }),
  };
}
