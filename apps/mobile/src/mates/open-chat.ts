import { useAui } from "@assistant-ui/react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

/**
 * Opens a chat that may have been created moments ago (by a mate, during a reply): the chat and
 * mate lists are refreshed first, so the header shows who it's with instead of the lead mate.
 */
export function useOpenChat() {
  const aui = useAui();
  const client = useQueryClient();
  return useCallback(
    async (chatId: string) => {
      await Promise.all([client.refetchQueries({ queryKey: ["chats"] }), client.refetchQueries({ queryKey: ["mates"] })]).catch(() => undefined);
      await aui.threads.reload();
      await aui.threads.switchToThread(chatId);
    },
    [aui, client],
  );
}

/** A card announcing new mates or groups: the lists pick them up as soon as it appears. */
export function useRefreshCrew() {
  const client = useQueryClient();
  return useCallback(() => {
    void client.invalidateQueries({ queryKey: ["chats"] });
    void client.invalidateQueries({ queryKey: ["mates"] });
  }, [client]);
}
