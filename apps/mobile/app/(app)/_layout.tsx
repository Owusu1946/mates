import { DarkTheme, DefaultTheme, Redirect, Stack, ThemeProvider, useRouter } from "expo-router";
import { Linking } from "react-native";
import * as Notifications from "expo-notifications";
import { useAuth } from "@clerk/expo";
import {
  AssistantRuntimeProvider,
  useAui,
  useLocalRuntime,
  useRemoteThreadListRuntime,
  type ChatModelAdapter,
} from "@assistant-ui/react-native";
import { useEffect, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  AppState,
  StyleSheet,
  View,
} from "react-native";
import { createChatModel } from "../../src/chat/chat-model";
import { createRemoteChats } from "../../src/chat/remote-chats";
import { ChatSyncContext } from "../../src/chat/chat-sync";
import { useSession } from "../../src/session/provider";
import { useTheme } from "../../src/theme/provider";
import { runRequest } from "../../src/chat/background-chat";
import { refreshNotificationRegistration } from "../../src/data/notifications";
import { CallProvider } from "../../src/call/call-model";
import { CallPill } from "../../src/call/call-pill";
import { LeaderGate } from "../../src/onboarding/leader-gate";
import { useCacheReady } from "../../src/data/offline-cache";

function AuthenticatedStack({ userId }: { userId: string }) {
  const router = useRouter();
  const handledResponses = useRef(new Map<string, number>());
  useEffect(() => {
    const open = (response: Notifications.NotificationResponse) => {
      const now = Date.now();
      const responseKey = `${response.notification.request.identifier}:${response.actionIdentifier}`;
      const previous = handledResponses.current.get(responseKey);
      if (previous && now - previous < 2_000) return;
      handledResponses.current.set(responseKey, now);
      for (const [key, timestamp] of handledResponses.current) {
        if (now - timestamp >= 2_000) handledResponses.current.delete(key);
      }

      const data = response.notification.request.content.data;
      const chatId = data?.chatId;
      if (typeof data?.reminderId === "string") {
        if (typeof data.url === "string" && data.url.startsWith("https://")) void Linking.openURL(data.url);
        else if (typeof chatId === "string") router.push({ pathname: "/(app)", params: { notificationChatId: chatId } });
        else router.push("/(app)");
        return;
      }
      if (typeof data?.codeRunId === "string") {
        if (typeof chatId === "string") router.push({ pathname: "/(app)", params: { notificationChatId: chatId } });
        else if (typeof data.url === "string" && data.url.startsWith("https://")) void Linking.openURL(data.url);
        else router.push("/(app)");
        return;
      }
      // A mate's or group's result (a routine, a background task) opens in their chat.
      const inMateChat = data?.chatKind === "mate" || data?.chatKind === "group";
      if (typeof chatId === "string" && (inMateChat || typeof data?.delegationId !== "string")) {
        router.push({ pathname: "/(app)", params: { notificationChatId: chatId } });
        return;
      }
      const id = data?.delegationId;
      if (typeof id === "string" && /^[a-f0-9-]{36}$/i.test(id)) router.push({ pathname: "/(app)/feed", params: { runId: id } });
    };
    const listener = Notifications.addNotificationResponseReceivedListener(open);
    void Notifications.getLastNotificationResponseAsync().then(response => { if (response) { open(response); void Notifications.clearLastNotificationResponseAsync(); } }).catch(() => {});
    return () => listener.remove();
  }, [router]);
  const { getToken } = useAuth();
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;
  useEffect(() => {
    const refresh = () => {
      void refreshNotificationRegistration(() => tokenRef.current(), userId).catch(() => {
        // Keep the last saved registration when the API or Expo is temporarily unavailable.
      });
    };
    refresh();
    const subscription = AppState.addEventListener("change", state => {
      if (state === "active") refresh();
    });
    return () => subscription.remove();
  }, [userId]);
  const chats = useMemo(() => createRemoteChats(userId, () => tokenRef.current()), [userId]);
  const runtime = useRemoteThreadListRuntime({
    adapter: chats.list,
    runtimeHook: function CooperThreadRuntime() {
      const aui = useAui();
      // Counts this phone's own runs, so history refreshes never overwrite a reply mid-stream.
      const streamingHere = useRef(0);
      const model = useMemo<ChatModelAdapter>(() => {
        const base = createChatModel(() => tokenRef.current(), () => aui.threadListItem.initialize());
        return {
          ...base,
          async *run(options) {
            streamingHere.current++;
            try {
              const result = base.run(options);
              if (Symbol.asyncIterator in result) yield* result;
              else yield await result;
            } finally {
              streamingHere.current--;
            }
          },
        };
      }, [aui]);
      const history = useMemo(() => chats.history(
        () => aui.threadListItem.getState().remoteId,
        () => aui.threadListItem.initialize(),
        () => aui.threadListItem.getState().id,
      ), [chats, aui]);
      const local = useLocalRuntime(model, { adapters: { history } });
      useEffect(() => {
        let disposed = false;
        let busy = false;
        let fingerprint = "";
        const recover = async () => {
          const id = aui.threadListItem.getState().remoteId;
          if (disposed || busy || !id || streamingHere.current > 0 || AppState.currentState !== "active") return;
          busy = true;
          try {
            const capabilities = await runRequest<{ durableRuns: boolean }>(() => tokenRef.current(), "capabilities");
            if (!capabilities.durableRuns) return;
            const { runs } = await runRequest<{ runs: { id: string; updatedAt: string }[] }>(() => tokenRef.current(), `runs?chatId=${encodeURIComponent(id)}`);
            const next = runs.map(run => `${run.id}:${run.updatedAt}`).join("|");
            if (next !== fingerprint && streamingHere.current === 0) {
              const saved = await history.loadFresh();
              if (!disposed && streamingHere.current === 0) local.thread.import(saved);
              fingerprint = next;
            }
          } catch { /* Keep cached history while disconnected. */ }
          finally { busy = false; }
        };
        const timer = setInterval(() => void recover(), 2000);
        const listener = AppState.addEventListener("change", state => { if (state === "active") void recover(); });
        void recover();
        return () => { disposed = true; clearInterval(timer); listener.remove(); };
      }, [aui, history, local]);
      // A cached chat on screen picks up the server copy as soon as it arrives, unless the user has
      // already moved it on (sent a message, a run is going), which the next sync covers.
      useEffect(() => chats.onFreshHistory((id, repository, shownHeadId) => {
        const thread = local.thread.getState();
        if (id !== aui.threadListItem.getState().remoteId || streamingHere.current > 0 || thread.messages.at(-1)?.id !== shownHeadId) return;
        local.thread.import(repository);
      }), [aui, local, chats]);
      return local;
    },
  });
  const { resolvedMode } = useTheme();
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ChatSyncContext.Provider value={chats.sync}>
      <ThemeProvider value={resolvedMode === "dark" ? DarkTheme : DefaultTheme}>
      <CallProvider>
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerBackButtonDisplayMode: "minimal" }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="feed" options={{ title: "Feed", headerLargeTitle: true, headerLargeTitleShadowVisible: false }} />
          <Stack.Screen name="ideas" options={{ title: "Ideas" }} />
          <Stack.Screen name="tasks" options={{ title: "Routines" }} />
          {/* A modal sheet (swipe down to close), as for New mate: a formSheet gives its content no height, so it renders blank. */}
          <Stack.Screen name="routine" options={{ headerShown: false, presentation: "modal" }} />
          <Stack.Screen name="settings" options={{ title: "Settings" }} />
          <Stack.Screen name="connections" options={{ title: "Apps", headerLargeTitle: true, headerLargeTitleShadowVisible: false }} />
          <Stack.Screen name="slack-link" options={{ title: "Slack" }} />
          <Stack.Screen name="memory" options={{ title: "Memory", headerLargeTitle: true, headerLargeTitleShadowVisible: false }} />
          <Stack.Screen name="usage" options={{ title: "Plan & usage", headerLargeTitle: true, headerLargeTitleShadowVisible: false }} />
          <Stack.Screen name="paywall" options={{ title: "Plans", presentation: "modal" }} />
          <Stack.Screen name="new-mate" options={{ title: "New", headerShown: false, presentation: "modal" }} />
          <Stack.Screen name="mate/[id]" options={{ title: "Mate" }} />
          <Stack.Screen name="group/[id]" options={{ title: "Group" }} />
          <Stack.Screen name="mission/[chatId]" options={{ title: "Mission notes" }} />
          <Stack.Screen name="call" options={{ headerShown: false, presentation: "fullScreenModal", animation: "slide_from_bottom" }} />
          <Stack.Screen name="deck/[id]" options={{ headerShown: false, presentation: "fullScreenModal", animation: "slide_from_bottom" }} />
        </Stack>
        <CallPill />
      </View>
      </CallProvider>
      </ThemeProvider>
      </ChatSyncContext.Provider>
    </AssistantRuntimeProvider>
  );
}

export default function ProtectedLayout() {
  const session = useSession();
  const { isLoaded, userId } = useAuth();
  const { colors } = useTheme();
  // The device cache loads behind the splash, so the first frame can show the last known chats.
  const cacheReady = useCacheReady(userId ?? null);
  if (session.status === "loading" || !isLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }
  if (session.status === "unauthenticated")
    return <Redirect href="/(public)/sign-in" />;

  if (!userId) return <Redirect href="/(public)/sign-in" />;
  if (!cacheReady) return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  return (
    <LeaderGate key={userId}>
      <AuthenticatedStack userId={userId} />
    </LeaderGate>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
});
