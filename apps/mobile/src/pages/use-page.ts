import { useAuth } from "@clerk/expo";
import type { WorkflowCard } from "@expojet/api-contract";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { Alert, Platform, Share } from "react-native";
import { runRequest } from "../chat/background-chat";
import { haptic } from "../haptics";

export type PageInfo = { id: string; title: string; status: string; visibility: "private" | "link"; url: string | null; version: number; error: string | null };
type PageView = { page: PageInfo; card: WorkflowCard };
type ShareReply = { status: "shared"; url: string; card: WorkflowCard } | { status: "confirm"; message: string };

const BUSY = ["queued", "outlining", "writing", "editing"];
export const pageBusy = (status: string | undefined) => !!status && BUSY.includes(status);

/** One page, kept live while it's being made or changed. */
export function usePage(pageId: string | undefined) {
  const { getToken, userId } = useAuth();
  return useQuery({
    queryKey: ["page", userId, pageId],
    enabled: !!pageId,
    queryFn: () => runRequest<PageView>(getToken, `pages/${pageId}`),
    refetchInterval: (query) => (pageBusy(query.state.data?.page.status) ? 2_000 : false),
  });
}

/**
 * Share, stop sharing and undo for a page. Sharing asks the server first: if the page shows personal
 * details (numbers, addresses, friends' names) the owner sees exactly what before the link goes out.
 */
export function usePageActions(pageId: string | undefined) {
  const { getToken, userId } = useAuth();
  const client = useQueryClient();
  const refresh = useCallback(() => client.invalidateQueries({ queryKey: ["page", userId, pageId] }), [client, userId, pageId]);

  const openShareSheet = async (title: string, url: string) => {
    await Share.share(Platform.OS === "ios" ? { url, message: title } : { message: `${title}\n${url}` }).catch(() => undefined);
  };

  const share = useCallback(async (title: string) => {
    if (!pageId) return;
    const send = async (confirmed: boolean) => {
      const reply = await runRequest<ShareReply>(getToken, `pages/${pageId}/share`, { confirmed });
      if (reply.status === "confirm") {
        haptic.warning();
        Alert.alert("Share this page?", reply.message, [
          { text: "Not now", style: "cancel" },
          { text: "Share anyway", onPress: () => void send(true).catch(fail) },
        ]);
        return;
      }
      haptic.success();
      await refresh();
      await openShareSheet(title, reply.url);
    };
    await send(false).catch(fail);
  }, [getToken, pageId, refresh]);

  const unshare = useCallback(async () => {
    if (!pageId) return;
    Alert.alert("Stop sharing?", "The link stops working straight away. You can share it again later.", [
      { text: "Keep sharing", style: "cancel" },
      {
        text: "Stop sharing",
        style: "destructive",
        onPress: async () => {
          try {
            await runRequest(getToken, `pages/${pageId}/unshare`, {});
            haptic.selection();
            await refresh();
          } catch (error) {
            fail(error);
          }
        },
      },
    ]);
  }, [getToken, pageId, refresh]);

  const undo = useCallback(async () => {
    if (!pageId) return;
    try {
      await runRequest(getToken, `pages/${pageId}/undo`, {});
      haptic.selection();
      await refresh();
    } catch (error) {
      fail(error);
    }
  }, [getToken, pageId, refresh]);

  return { share, unshare, undo, openShareSheet, refresh };
}

function fail(error: unknown) {
  haptic.error();
  Alert.alert("Couldn’t do that", error instanceof Error ? error.message : "Try again.");
}
