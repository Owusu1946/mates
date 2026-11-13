import { useAuth } from "@clerk/expo";
import { useAui } from "@assistant-ui/react-native";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { plainPreview } from "../../src/components/rich-text/markdown-text";
import { RichText } from "../../src/components/rich-text/rich-text";
import { runRequest, type RunView } from "../../src/chat/background-chat";
import { ChatIcon } from "../../src/chat/chat-icon";
import { disableNotifications, enableNotifications, notificationDeviceKey, refreshNotificationRegistration } from "../../src/data/notifications";
import { haptic } from "../../src/haptics";
import { usePullToRefresh } from "../../src/hooks/use-pull-to-refresh";
import { useTheme } from "../../src/theme/provider";

type Finding = { id: string; title: string; summary: string; readAt: string | null; createdAt: string; status: string; chatId: string | null };
const font = { regular: "DMSans_400Regular", medium: "DMSans_500Medium", semibold: "DMSans_600SemiBold" };
const ACTIVE = ["queued", "running"];

/** "just now", "12 min ago", "3 h ago", "yesterday", "12 Nov". */
function ago(iso: string, now = Date.now()) {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  if (hours < 48) return "yesterday";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

const statusText = (status: string) => (status === "waiting" || status === "needs_input" ? "Needs you" : status === "failed" ? "Didn’t finish" : ACTIVE.includes(status) ? "Working" : status === "cancelled" ? "Stopped" : null);

/** What the mates finished while you were away: a plain list, newest first, with the open result on top. */
export default function FeedScreen() {
  const { userId, getToken } = useAuth();
  const { colors } = useTheme();
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
      if (!userId) {
        setNotifications(false);
        return;
      }
      const token = await AsyncStorage.getItem(notificationDeviceKey(userId));
      if (active) setNotifications(!!token);
      if (!token) return;
      try {
        const enabled = await refreshNotificationRegistration(getToken, userId);
        if (active) setNotifications(enabled);
      } catch {
        /* Keep the last saved preference when status cannot be checked. */
      }
    };
    void refresh();
    return () => {
      active = false;
    };
  }, [userId, getToken]);

  const id = selected ?? params.runId ?? null;
  const feed = useQuery({ queryKey: ["findings", userId], queryFn: () => runRequest<{ items: Finding[] }>(getToken, "feed"), refetchInterval: 15_000 });
  // A result only needs polling while it's still being worked on.
  const result = useQuery({
    queryKey: ["finding-result", userId, id],
    queryFn: () => runRequest<{ run: RunView }>(getToken, `runs/${id}`),
    enabled: !!id,
    refetchInterval: (query) => (ACTIVE.includes(query.state.data?.run.status ?? "queued") ? 2_500 : false),
  });
  const delivery = useQuery({ queryKey: ["finding-delivery", userId, id], queryFn: () => runRequest<{ deliveries: { id: string; status: string; error: string | null }[] }>(getToken, `runs/${id}/deliveries`), enabled: !!id });
  // The spinner shows only for a pull, never for the background refreshes.
  const pull = usePullToRefresh(() => Promise.all([feed.refetch(), id ? result.refetch() : null]));
  useFocusEffect(useCallback(() => void feed.refetch(), [feed.refetch]));

  const openChat = async (chatId: string) => {
    setError(null);
    try {
      await aui.threads.reload();
      aui.threads.switchToThread(chatId);
      router.push("/(app)");
    } catch {
      setError("Couldn’t open this chat. Please try again.");
    }
  };
  const toggleNotifications = async () => {
    setBusy(true);
    setError(null);
    haptic.selection();
    try {
      if (notifications) await disableNotifications(getToken, userId!);
      else await enableNotifications(getToken, userId!);
      setNotifications(!notifications);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t update notifications.");
    } finally {
      setBusy(false);
    }
  };
  const open = (item: Finding) => {
    haptic.light();
    setSelected(item.id);
    if (!item.readAt) void runRequest(getToken, `feed/${item.id}/read`, {}).then(() => feed.refetch()).catch(() => undefined);
  };

  const items = feed.data?.items ?? [];
  const run = result.data?.run;
  const runText = run?.content.filter((part) => part.type === "text").map((part) => String(part.text)).join("\n\n") ?? "";
  const openTitle = items.find((item) => item.id === id)?.title;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingTop: 8, paddingBottom: 56, gap: 24 }}
      refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
    >
      <View style={{ paddingHorizontal: 20, gap: 16 }}>
        <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 15, lineHeight: 22 }}>What your mates finished, routine results, and anything that needs you.</Text>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 16, paddingVertical: 13, borderRadius: 18, borderCurve: "continuous", backgroundColor: colors.surface }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: colors.text, fontFamily: font.medium, fontSize: 16 }}>Notify me when results land</Text>
            <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 13 }}>{notifications ? "Quiet from 22:00 to 08:00 your time." : "Get a notification for each finished task."}</Text>
          </View>
          <Switch value={notifications} disabled={busy || !userId} onValueChange={() => void toggleNotifications()} accessibilityLabel="Result notifications" />
        </View>

        {(error || feed.isError || result.isError) && (
          <Text accessibilityLiveRegion="polite" style={{ color: colors.error, fontFamily: font.medium, fontSize: 14 }}>
            {error ?? "Couldn’t refresh. Your saved results are kept. Pull down to try again."}
          </Text>
        )}
      </View>

      {id && (
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text numberOfLines={1} style={{ flex: 1, color: colors.textMuted, fontFamily: font.medium, fontSize: 13 }}>
              {run ? (statusText(run.status) ?? "Result") : "Result"}
              {run ? ` · ${ago(run.updatedAt)}` : ""}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close result" hitSlop={10} onPress={() => setSelected(null)} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
              <ChatIcon name="close" color={colors.textMuted} size={18} />
            </Pressable>
          </View>
          {openTitle && <Text style={{ color: colors.text, fontFamily: font.semibold, fontSize: 19, lineHeight: 25 }}>{openTitle}</Text>}
          {result.isLoading ? (
            <ResultSkeleton />
          ) : run ? (
            <>
              {runText ? (
                <RichText colors={{ text: colors.text, muted: colors.textMuted, surface: colors.surface, border: colors.border }}>{runText}</RichText>
              ) : (
                <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 15 }}>{ACTIVE.includes(run.status) ? "Working on it. You can leave the app; the result is saved." : "No written result for this one."}</Text>
              )}
              {run.error && <Text style={{ color: colors.error, fontFamily: font.regular, fontSize: 14 }}>{run.error}</Text>}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {run.chatId && <Pill label={run.status === "waiting" ? "Continue in chat" : "Open in chat"} strong onPress={() => void openChat(run.chatId!)} />}
                {ACTIVE.includes(run.status) && (
                  <Pill
                    label="Stop"
                    onPress={async () => {
                      try {
                        await runRequest(getToken, `runs/${id}/cancel`, {});
                        await result.refetch();
                      } catch {
                        setError("Couldn’t stop the task. Please try again.");
                      }
                    }}
                  />
                )}
                {delivery.data?.deliveries.some((d) => d.status === "failed") && (
                  <Pill
                    label="Retry notification"
                    onPress={async () => {
                      try {
                        await runRequest(getToken, `runs/${id}/deliveries/retry`, {});
                        await delivery.refetch();
                      } catch {
                        setError("Couldn’t retry the notification. The result is saved.");
                      }
                    }}
                  />
                )}
              </View>
            </>
          ) : null}
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginTop: 8 }} />
        </View>
      )}

      {feed.isLoading && <ListSkeleton />}

      {feed.isSuccess && items.length === 0 && (
        <View style={{ alignItems: "center", gap: 10, paddingVertical: 48, paddingHorizontal: 20 }}>
          <View style={{ width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
            <ChatIcon name="feed" color={colors.text} size={24} />
          </View>
          <Text style={{ color: colors.text, fontFamily: font.semibold, fontSize: 16 }}>Nothing here yet</Text>
          <Text style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 14, lineHeight: 20, textAlign: "center", maxWidth: 290 }}>
            When your mates finish a task or a routine runs, the result shows up here.
          </Text>
        </View>
      )}

      {items.length > 0 && (
        <View>
          {items.map((item, i) => {
            const status = statusText(item.status);
            const unread = !item.readAt;
            const current = item.id === id;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`${unread ? "New. " : ""}${item.title}`}
                onPress={() => open(item)}
                style={({ pressed }) => ({ backgroundColor: pressed || current ? colors.surface : "transparent" })}
              >
                {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, marginLeft: 40, backgroundColor: colors.border }} />}
                <View style={{ flexDirection: "row", gap: 12, paddingLeft: 20, paddingRight: 20, paddingVertical: 14 }}>
                  <View style={{ width: 8, paddingTop: 8 }}>{unread && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} />}</View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                      <Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontFamily: unread ? font.semibold : font.medium, fontSize: 16 }}>{item.title}</Text>
                      <Text style={{ color: colors.textMuted, fontFamily: font.regular, fontSize: 12 }}>{ago(item.createdAt)}</Text>
                    </View>
                    <Text numberOfLines={2} style={{ color: colors.textSecondary, fontFamily: font.regular, fontSize: 14, lineHeight: 20 }}>{plainPreview(item.summary)}</Text>
                    {status && <Text style={{ color: status === "Needs you" ? colors.text : status === "Didn’t finish" ? colors.error : colors.textMuted, fontFamily: font.medium, fontSize: 12, marginTop: 2 }}>{status}</Text>}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

function Pill({ label, strong, onPress }: { label: string; strong?: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const [working, setWorking] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      disabled={working}
      onPress={async () => {
        setWorking(true);
        try {
          await onPress();
        } finally {
          setWorking(false);
        }
      }}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: strong ? colors.text : colors.surface, opacity: pressed ? 0.7 : 1 })}
    >
      {working && <ActivityIndicator size="small" color={strong ? colors.background : colors.text} />}
      <Text style={{ color: strong ? colors.background : colors.text, fontFamily: font.semibold, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

/** Rows in the list's shape while the first load runs, instead of a spinner. */
function ListSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={{ paddingHorizontal: 40, gap: 26, paddingTop: 6 }}>
      {[0.6, 0.75, 0.5, 0.7].map((w, i) => (
        <View key={i} style={{ gap: 8 }}>
          <View style={{ width: `${w * 100}%`, height: 13, borderRadius: 6, backgroundColor: colors.surface }} />
          <View style={{ width: "92%", height: 10, borderRadius: 5, backgroundColor: colors.surface }} />
          <View style={{ width: "70%", height: 10, borderRadius: 5, backgroundColor: colors.surface }} />
        </View>
      ))}
    </View>
  );
}

function ResultSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 9 }}>
      {[1, 0.95, 0.85, 0.6].map((w, i) => (
        <View key={i} style={{ width: `${w * 100}%`, height: 11, borderRadius: 6, backgroundColor: colors.surface }} />
      ))}
    </View>
  );
}
