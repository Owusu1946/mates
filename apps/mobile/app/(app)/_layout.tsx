import { DarkTheme, DefaultTheme, Redirect, Stack, ThemeProvider, useRouter, useSegments } from "expo-router";
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
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { createChatModel } from "../../src/chat/chat-model";
import { createRemoteChats, type HistoryPage } from "../../src/chat/remote-chats";
import { planMerge } from "../../src/chat/history-merge";

/** How often an open chat checks its runs while one is going, and when none is. */
const ACTIVE_CHECK = 2000;
const IDLE_CHECK = 20_000;
/** Run statuses that won't change again on their own (the server's terminalRun). */
const FINISHED_RUN = new Set(["completed", "failed", "cancelled", "waiting"]);
import { ChatSyncContext } from "../../src/chat/chat-sync";
import { useSession } from "../../src/session/provider";
import { useTheme } from "../../src/theme/provider";
import { runRequest } from "../../src/chat/background-chat";
import { refreshNotificationRegistration } from "../../src/data/notifications";
import { CallProvider } from "../../src/call/call-model";
import { CallPill } from "../../src/call/call-pill";
import { LeaderGate } from "../../src/onboarding/leader-gate";
import { useCacheReady } from "../../src/data/offline-cache";
import { canRetryPendingShare, readPendingShare } from "../../src/share/pending";
import { readAndroidPendingShare } from "../../src/share/android-pending";
import { takePendingInvite } from "../../src/friends/pending-invite";

function AuthenticatedStack({ userId }: { userId: string }) {
  const router = useRouter();
  const { getToken } = useAuth();
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;
  const segments = useSegments();
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;
  const promptedShare = useRef<string | null>(null);
  const openingShare = useRef(false);
  useEffect(() => {
    const openPending = async () => {
      if (openingShare.current) return;
      openingShare.current = true;
      try {
        const pending = Platform.OS === "ios"
          ? readPendingShare(userId)
          : await readAndroidPendingShare(userId);
        if (!pending || promptedShare.current === pending.id || (Platform.OS === "ios" && !canRetryPendingShare(pending))) return;
        promptedShare.current = pending.id;
        const onShareRoute = segmentsRef.current.at(-1) === "share-pending" || segmentsRef.current.at(-1) === "share-receive";
        if (!onShareRoute) router.push(Platform.OS === "ios" ? "/(app)/share-pending" : "/(app)/share-receive");
      } finally {
        openingShare.current = false;
      }
    };
    void openPending();
    const listener = AppState.addEventListener("change", state => {
      if (state === "active") void openPending();
    });
    // The extension can finish while Mates remains active, without an AppState event.
    const timer = Platform.OS === "ios" ? setInterval(() => {
      if (AppState.currentState === "active") void openPending();
    }, 2000) : null;
    return () => {
      listener.remove();
      if (timer) clearInterval(timer);
    };
  }, [router, userId]);
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

      // Remove only the notification the user opened; keep unrelated reminders and alerts.
      void Notifications.dismissNotificationAsync(response.notification.request.identifier).catch(() => {});
      const data = response.notification.request.content.data;
      const chatId = data?.chatId;
      if (typeof data?.morningBriefId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.morningBriefId)) {
        void runRequest(() => tokenRef.current(), `morning-brief/${data.morningBriefId}/view`, {}).catch(() => undefined);
      }
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
      // A screen of the app itself (Friends, the computer) when there's no chat to open.
      if (typeof data?.url === "string" && /^\/(?:[a-z-]+|page\/[0-9a-f-]{36})$/.test(data.url) && typeof chatId !== "string") {
        router.push(data.url as never);
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
  // An invite link opened before signing in opens now.
  useEffect(() => {
    void takePendingInvite().then((code) => { if (code) router.push({ pathname: "/connect", params: { c: code } }); });
  }, [router]);
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
        let loadingEarlier = false;
        // This chat's runs as "id:updatedAt". Unknown until the first check, which still looks at
        // the newest messages if the chat has runs: one may have finished after a reply's stream
        // broke off (the app went to the background), with nothing left to change after.
        let fingerprint: string | null = null;
        let active = false;
        let lastCheck = 0;
        const remote = () => aui.threadListItem.getState().remoteId;
        // Server rows into the open chat: only what changed is swapped in, so the rest of the chat
        // keeps its rows and its place. Never while this phone is streaming a reply.
        const merge = (id: string, page: HistoryPage, keepHead = false) => {
          if (disposed || id !== remote() || streamingHere.current > 0) return undefined;
          const plan = planMerge(local.thread.export(), page.messages, { realParents: chats.parentsOf(id), serverHead: page.headId, keepHead });
          if (plan) local.thread.import(plan);
          return plan;
        };
        // Runs change as a mate works elsewhere (a routine, a mission, the computer). Check often
        // only while one is going in this chat; otherwise now and then, and on coming back.
        const check = async (force = false) => {
          const id = remote();
          if (disposed || busy || !id || streamingHere.current > 0 || AppState.currentState !== "active") return;
          if (!force && !active && Date.now() - lastCheck < IDLE_CHECK) return;
          busy = true;
          lastCheck = Date.now();
          try {
            const { runs } = await runRequest<{ runs: { id: string; status: string; updatedAt: string }[] }>(() => tokenRef.current(), `runs?chatId=${encodeURIComponent(id)}`);
            if (id !== remote()) return;
            active = runs.some(run => !FINISHED_RUN.has(run.status));
            const next = runs.map(run => `${run.id}:${run.updatedAt}`).join("|");
            if (next !== fingerprint && (fingerprint !== null || runs.length > 0)) {
              const plan = merge(id, await history.refresh());
              // Fell further behind than the newest few: fill the gap with a full page.
              const caughtUp = plan && !plan.connected ? merge(id, await history.refresh(true)) : plan;
              if (caughtUp === undefined) return; // a reply started streaming; look again next time
            }
            fingerprint = next;
          } catch { /* Keep what's on screen while disconnected. */ }
          finally { busy = false; }
        };
        const timer = setInterval(() => void check(), ACTIVE_CHECK);
        const listener = AppState.addEventListener("change", state => { if (state === "active") void check(true); });
        void check(true);
        // A cached chat on screen picks up the server's newest page as soon as it arrives.
        const unfresh = chats.onFreshHistory((id, page) => void merge(id, page));
        // Scrolling to the top loads the page above the oldest message on the branch on screen.
        const unearlier = chats.sync.paging.register(aui.threadListItem.getState().id, async () => {
          const id = remote();
          if (disposed || loadingEarlier || !id || streamingHere.current > 0) return;
          const shown = local.thread.export();
          const byId = new Map(shown.messages.map(item => [item.message.id, item]));
          let top = shown.headId ?? shown.messages.at(-1)?.message.id;
          for (let parent = top && byId.get(top)?.parentId; parent && byId.has(parent); parent = byId.get(parent)?.parentId) top = parent;
          if (!top) return;
          loadingEarlier = true;
          try {
            merge(id, await history.loadEarlier(top), true);
          } catch { /* Try again on the next scroll to the top. */ }
          finally { loadingEarlier = false; }
        });
        return () => { disposed = true; clearInterval(timer); listener.remove(); unfresh(); unearlier(); };
      }, [aui, history, local, chats]);
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
          <Stack.Screen name="response-ui-preview" options={{ title: "Response UI preview", presentation: "modal" }} />
          <Stack.Screen name="ideas" options={{ title: "Ideas" }} />
          <Stack.Screen name="tasks" options={{ title: "Routines" }} />
          {/* A modal sheet (swipe down to close), as for New mate: a formSheet gives its content no height, so it renders blank. */}
          <Stack.Screen name="routine" options={{ headerShown: false, presentation: "modal" }} />
          <Stack.Screen name="settings" options={{ title: "Settings" }} />
          <Stack.Screen name="morning-brief" options={{ title: "Morning brief", headerLargeTitle: true, headerLargeTitleShadowVisible: false }} />
          <Stack.Screen name="connections" options={{ title: "Apps", headerLargeTitle: true, headerLargeTitleShadowVisible: false }} />
          <Stack.Screen name="slack-link" options={{ title: "Slack" }} />
          <Stack.Screen name="memory" options={{ title: "Memory", headerLargeTitle: true, headerLargeTitleShadowVisible: false }} />
          <Stack.Screen name="memory-import" options={{ title: "Import memories" }} />
          <Stack.Screen name="share-pending" options={{ title: "Finish sharing", presentation: "modal" }} />
          <Stack.Screen name="share-receive" options={{ title: "Share to a mate", presentation: "modal" }} />
          <Stack.Screen name="permissions" options={{ title: "Permissions", headerLargeTitle: true, headerLargeTitleShadowVisible: false }} />
          <Stack.Screen name="friends" options={{ title: "Friends", headerLargeTitle: true, headerLargeTitleShadowVisible: false }} />
          <Stack.Screen name="connect" options={{ headerShown: false, presentation: "modal" }} />
          <Stack.Screen name="friend" options={{ title: "" }} />
          <Stack.Screen name="noticed" options={{ title: "What I’ve noticed", headerLargeTitle: true, headerLargeTitleShadowVisible: false }} />
          <Stack.Screen name="usage" options={{ title: "Plan & usage", headerLargeTitle: true, headerLargeTitleShadowVisible: false }} />
          <Stack.Screen name="paywall" options={{ title: "Plans", presentation: "modal" }} />
          <Stack.Screen name="new-mate" options={{ title: "New", headerShown: false, presentation: "modal" }} />
          <Stack.Screen name="mate/[id]" options={{ title: "Mate" }} />
          <Stack.Screen name="group/[id]" options={{ title: "Group" }} />
          <Stack.Screen name="mission/[chatId]" options={{ title: "Mission notes" }} />
          <Stack.Screen name="call" options={{ headerShown: false, presentation: "fullScreenModal", animation: "slide_from_bottom" }} />
          <Stack.Screen name="computer" options={{ headerShown: false, presentation: "fullScreenModal", animation: "slide_from_bottom" }} />
          <Stack.Screen name="deck/[id]" options={{ headerShown: false, presentation: "fullScreenModal", animation: "slide_from_bottom" }} />
          <Stack.Screen name="page/[id]" options={{ headerShown: false, presentation: "fullScreenModal", animation: "slide_from_bottom" }} />
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
