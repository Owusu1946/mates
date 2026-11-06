import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
} from "react";
import { Pressable, Text, View } from "react-native";
import { useAui } from "@assistant-ui/react-native";
import type { createRemoteChats } from "./remote-chats";

export const ChatSyncContext = createContext<
  ReturnType<typeof createRemoteChats>["sync"] | null
>(null);
export function ChatSyncNotice() {
  const sync = useContext(ChatSyncContext);
  const aui = useAui();
  const [retrying, setRetrying] = useState(false);
  const error = useSyncExternalStore(
    sync?.subscribe ?? (() => () => {}),
    sync?.getSnapshot ?? (() => null),
  );
  if (!error) return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        marginHorizontal: 16,
        marginVertical: 6,
        padding: 12,
        borderRadius: 12,
        backgroundColor: "#fff1f2",
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}
    >
      <Text style={{ flex: 1, color: "#9f1239", fontSize: 13 }}>{error}</Text>
      <Pressable
        disabled={retrying}
        accessibilityRole="button"
        onPress={async () => {
          setRetrying(true);
          try {
            await sync?.retry();
            await aui.threads.reload();
          } catch {
            /* Keep the notice and local queue for another retry. */
          } finally {
            setRetrying(false);
          }
        }}
      >
        <Text style={{ color: "#9f1239", fontWeight: "600" }}>
          {retrying ? "Syncing…" : "Retry"}
        </Text>
      </Pressable>
    </View>
  );
}
