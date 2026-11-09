import { useAuth } from "@clerk/expo";
import { useAui } from "@assistant-ui/react-native";
import { Button, Host } from "@expo/ui";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import Markdown from "react-native-markdown-display";
import { runRequest, type RunView } from "../../src/chat/background-chat";
import { disableNotifications, enableNotifications, notificationDeviceKey, refreshNotificationRegistration } from "../../src/data/notifications";
import { useTheme } from "../../src/theme/provider";

type Finding = { id: string; title: string; summary: string; readAt: string | null; createdAt: string; status: string; chatId: string | null };
export default function FeedScreen() {
  const { userId, getToken } = useAuth();
  const { colors, isDark } = useTheme();
  const aui = useAui();
  const router = useRouter();
  const params = useLocalSearchParams<{ runId?: string }>();
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notifications, setNotifications] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (!userId) { setNotifications(false); return; }
      const token = await AsyncStorage.getItem(notificationDeviceKey(userId));
      if (active) setNotifications(!!token);
      if (!token) return;
      try {
        const enabled = await refreshNotificationRegistration(getToken, userId);
        if (active) setNotifications(enabled);
      } catch { /* Keep the last saved preference when status cannot be checked. */ }
    };
    void refresh();
    return () => { active = false; };
  }, [userId, getToken]);
  const id = selected ?? params.runId;
  const feed = useQuery({ queryKey: ["findings", userId], queryFn: () => runRequest<{ items: Finding[] }>(getToken, "feed"), refetchInterval: 5000 });
  const result = useQuery({ queryKey: ["finding-result", userId, id], queryFn: () => runRequest<{ run: RunView }>(getToken, `runs/${id}`), enabled: !!id, refetchInterval: 2500 });
  const delivery = useQuery({ queryKey: ["finding-delivery", userId, id], queryFn: () => runRequest<{ deliveries: { id: string; status: string; error: string | null }[] }>(getToken, `runs/${id}/deliveries`), enabled: !!id, refetchInterval: 10_000 });
  useFocusEffect(useCallback(() => { void feed.refetch(); }, [feed.refetch]));
  const openChat = async (chatId: string) => {
    setError(null);
    try { await aui.threads.reload(); aui.threads.switchToThread(chatId); router.push("/(app)"); }
    catch { setError("Couldn’t open this chat. Please try again."); }
  };
  return <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 48 }} refreshControl={<RefreshControl refreshing={feed.isFetching} onRefresh={() => void feed.refetch()} />}>
    <Text style={{ color: colors.text, fontSize: 30, fontWeight: "700" }}>From your mates</Text>
    <Text style={{ color: colors.textSecondary, fontSize: 15 }}>Saved findings, routine results, and requests needing your attention.</Text>
    <Host matchContents colorScheme={isDark ? "dark" : "light"}><Button label={notifications ? "Turn off result notifications" : "Enable result notifications"} variant="outlined" disabled={busy || !userId} onPress={async () => {
      setBusy(true); setError(null);
      try { if (notifications) await disableNotifications(getToken, userId!); else await enableNotifications(getToken, userId!); setNotifications(!notifications); } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn’t update notifications."); } finally { setBusy(false); }
    }} /></Host>
    {notifications && <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Quiet hours: 22:00–08:00 in your phone’s timezone.</Text>}
    {error && <Text style={{ color: colors.error }}>{error}</Text>}
    {(feed.isError || result.isError) && <Text style={{ color: colors.error }}>Couldn’t refresh. Your saved results are kept. Pull down to retry.</Text>}
    {id && <View style={{ padding: 18, gap: 12, borderRadius: 20, backgroundColor: colors.surface }}>
      {result.isLoading ? <Text style={{ color: colors.textSecondary }}>Loading result…</Text> : result.data && <>
        <Text style={{ color: colors.textMuted }}>{result.data.run.status.toUpperCase()}</Text>
        {result.data.run.content.filter(part => part.type === "text").map((part, i) => <Markdown key={i} style={{ body: { color: colors.text, fontSize: 15, lineHeight: 23 } }}>{String(part.text)}</Markdown>)}
        {!result.data.run.content.length && <Text style={{ color: colors.textSecondary }}>Preparing this task. You can leave the app.</Text>}
        {result.data.run.error && <Text style={{ color: colors.error }}>{result.data.run.error}</Text>}
        {result.data.run.chatId && <Host matchContents colorScheme={isDark ? "dark" : "light"}><Button label={result.data.run.status === "waiting" ? "Open chat to continue" : "Open full result"} onPress={() => void openChat(result.data!.run.chatId!)} /></Host>}
        {["queued", "running"].includes(result.data.run.status) && <Host matchContents colorScheme={isDark ? "dark" : "light"}><Button label="Stop task" variant="outlined" onPress={async () => {
          try { await runRequest(getToken, `runs/${id}/cancel`, {}); await result.refetch(); } catch { setError("Couldn’t stop the task. Please try again."); }
        }} /></Host>}
        {delivery.data?.deliveries.map(item => <Text key={item.id} style={{ color: colors.textSecondary, fontSize: 12 }}>Notification: {item.status.replace(/_/g, " ")}{item.error ? ` · ${item.error}` : ""}</Text>)}
        {delivery.data?.deliveries.some(item => item.status === "failed") && <Host matchContents colorScheme={isDark ? "dark" : "light"}><Button label="Retry notification" variant="text" onPress={async () => {
          try { await runRequest(getToken, `runs/${id}/deliveries/retry`, {}); await delivery.refetch(); } catch { setError("Couldn’t retry notification. The task result is saved."); }
        }} /></Host>}
      </>}
    </View>}
    {feed.isLoading && <Text style={{ color: colors.textSecondary }}>Loading findings…</Text>}
    {feed.data?.items.length === 0 && !feed.isLoading && <Text style={{ color: colors.textSecondary, paddingVertical: 30 }}>Your completed tasks and routine results will appear here.</Text>}
    {feed.data?.items.map(item => <Pressable key={item.id} accessibilityRole="button" onPress={() => {
      setSelected(item.id);
      void runRequest(getToken, `feed/${item.id}/read`, {}).then(() => feed.refetch()).catch(() => setError("Couldn’t mark this result as read."));
    }} style={({ pressed }) => ({ padding: 18, borderRadius: 20, gap: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: pressed ? colors.surfaceElevated : colors.surface })}>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{!item.readAt ? "NEW · " : ""}{item.status === "waiting" ? "Needs attention" : item.status} · {new Date(item.createdAt).toLocaleDateString()}</Text>
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: "600" }}>{item.title}</Text>
      <Text numberOfLines={3} style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 21 }}>{item.summary}</Text>
    </Pressable>)}
  </ScrollView>;
}
